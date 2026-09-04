// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}




contract NeroCollateral {
    address public admin;
    address public feeWallet;

    struct Vendor {
        uint256 totalCollateral;
        uint256 lockedCollateral;
    }

    struct Dispute {
        bool isActive;
        uint256 amount;
    }

    mapping(address => Vendor) public vendors;
    mapping(string => uint256) public orderLocks;
    mapping(string => Dispute) public disputes; // Registro de disputas por orderId

        event CollateralDeposited(address indexed vendor, address token, uint256 amount);
    event CollateralLocked(address indexed vendor, string orderId, uint256 amount);
    event CollateralReleased(address indexed vendor, string orderId, uint256 amount, uint256 fee);
        event CollateralWithdrawn(address indexed vendor, uint256 amount);
    event OrderDisputed(string orderId, uint256 amount);
    event DisputeResolved(string orderId, bool penalized);
    event CollateralSeized(address indexed vendor, string orderId, uint256 amount);

        constructor() {
        admin = msg.sender;
        feeWallet = msg.sender; // por defecto, el admin también es wallet de fees
    }

        modifier onlyAdmin() {
        require(msg.sender == admin, "Solo Admin");
        _;
    }

    function setFeeWallet(address _newFeeWallet) external onlyAdmin {
        require(_newFeeWallet != address(0), "Direccion invalida");
        feeWallet = _newFeeWallet;
    }

    function changeAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Direccion invalida");
        admin = _newAdmin;
    }

    // 1. EL VENDEDOR DEPOSITA SU GARANTÍA (USDT/USDC)
    // *Nota: El frontend debe hacer "approve" al token antes de llamar aquí*
    function depositCollateral(address _tokenAddress, uint256 _amount) external {
        require(_amount > 0, "Monto debe ser mayor a cero");
        
                IERC20 token = IERC20(_tokenAddress);
        bool success = token.transferFrom(msg.sender, address(this), _amount);
        require(success, "Fallo transferencia de token");

        vendors[msg.sender].totalCollateral += _amount;
        emit CollateralDeposited(msg.sender, _tokenAddress, _amount);
    }

    // 1b. RETIRO DE SALDO LIBRE (no congelado) por el vendedor
    function withdrawCollateral(address _tokenAddress, uint256 _amount) external {
        Vendor storage v = vendors[msg.sender];
        require(v.totalCollateral - v.lockedCollateral >= _amount, "Saldo libre insuficiente");
        v.totalCollateral -= _amount;
        IERC20 token = IERC20(_tokenAddress);
        require(token.transfer(msg.sender, _amount), "Fallo envio de tokens");
        emit CollateralWithdrawn(msg.sender, _amount);
    }

    // 2. EL BACKEND BLOQUEA SALDO CUANDO SE INICIA UNA ORDEN P2P
    function lockOrderCollateral(string memory _orderId, address _vendor, uint256 _amount) external onlyAdmin {
        Vendor storage v = vendors[_vendor];
        // Verifica que el vendedor tenga fondos libres suficientes
        require(v.totalCollateral - v.lockedCollateral >= _amount, "Saldo disponible insuficiente");
        require(orderLocks[_orderId] == 0, "La orden ya tiene un bloqueo");

        v.lockedCollateral += _amount;
        orderLocks[_orderId] = _amount;

        emit CollateralLocked(_vendor, _orderId, _amount);
    }

        /**
         * 3. EL BACKEND LIBERA LA GARANTÍA.
         *
         *    MODELO DE NEGOCIO (bóveda de garantía "de depósito"):
         *      - El vendedor DEPOSITA USDT a su fondo de garantía (pool). Ese saldo
         *        físicamente queda dentro del contrato (bóveda agregada).
         *      - Al crearse una orden, parte de ese saldo pasa de 'available' a
         *        'locked' SIN mover tokens (solo contabilidad).
         *      - Al COMPLETAR la orden: solo el FEE (si >0, hoy 3%) emerge del
         *        colateral del vendedor y se paga a feeWallet. El resto del monto
         *        liberado vuelve a 'available' del vendedor DENTRO del pool.
         *      - Al CANCELAR (o expirar sin pago): el 'locked' pasa a 'available'
         *        SIN transferir tokens. Si en el futuro se cobra un fee por
         *        cancelación/penalización, se pasa un _feeAmount > 0 y ese % se
         *        descuenta igual (va a feeWallet).
         *
         *    ⚠️ INVARIANTE CRÍTICO: NUNCA se transfiere el monto liberado ('net')
         *    a la wallet externa del vendedor desde acá. El USDT ya pertenece a la
         *    cuenta de garantía del vendedor dentro del pool; lo retira él mismo
         *    cuando quiere con withdrawCollateral (que sí mueve tokens reales).
         *    Deshacerse de esto era lo que drenaba el pool en cada cancelación y
         *    provocaba el fallo "BEP40: transfer amount exceeds balance".
         */
        function releaseOrderCollateral(
            string memory _orderId,
            address _vendor,
            address _tokenAddress,
            uint256 _feeAmount
        ) external onlyAdmin {
            require(!disputes[_orderId].isActive, "Hay una disputa activa");

            uint256 amount = orderLocks[_orderId];
            require(amount > 0, "No hay saldo bloqueado para esta orden");
            require(_feeAmount <= amount, "Fee mayor que el monto");

            Vendor storage v = vendors[_vendor];
            uint256 fee = _feeAmount;

            // 1) El lock queda liberado: pasa de 'locked' a 'available' interno.
            v.lockedCollateral -= amount;

            // 2) Solo el FEE emerge del depósito del vendedor y va al feeWallet.
            //    El resto (amount - fee) permanece como saldo disponible del
            //    vendedor dentro del pool (ya respaldado por su depósito físico).
            if (fee > 0) {
                v.totalCollateral -= fee;
                IERC20 token = IERC20(_tokenAddress);
                require(token.transfer(feeWallet, fee), "Fallo envio del fee");
            }

            delete orderLocks[_orderId];
            emit CollateralReleased(_vendor, _orderId, amount - fee, fee);
        }

    // 4. EL BACKEND LLAMA AQUÍ SI EL COMPRADOR REPORTA UN PROBLEMA (Se congela la liberación)
    function triggerDispute(string memory _orderId) external onlyAdmin {
        uint256 amount = orderLocks[_orderId];
        require(amount > 0, "No hay saldo bloqueado");
        disputes[_orderId] = Dispute(true, amount);
        
        emit OrderDisputed(_orderId, amount);
    }

        // 5. RESOLUCIÓN DE DISPUTA POR EL ADMIN.
    //    POTESTAD EN CASO EXTREMO (fraude del vendedor contra el comprador):
    //    el admin puede ejecutar el saldo BLOQUEADO de esa orden puntual y
    //    retenerlo (va a feeWallet, cuenta del proyecto/admin) para resarcir
    //    al comprador. Solo procede sobre una disputa activa y sobre el monto
    //    que estaba congelado de la orden (no sobre saldo de otras órdenes).
    //      - _penalize = true  → el vendedor pierde ese colateral, se envía a
    //                            feeWallet (luego el admin compensa al comprador).
    //      - _penalize = false → sin culpa del vendedor: el monto vuelve a su
    //                            saldo disponible en el pool.
    function resolveDispute(string memory _orderId, address _vendor, address _tokenAddress, bool _penalize) external onlyAdmin {
        require(disputes[_orderId].isActive, "No hay disputa activa");
        uint256 amount = disputes[_orderId].amount;
        Vendor storage v = vendors[_vendor];
        require(v.lockedCollateral >= amount, "Saldo bloqueado insuficiente");

        if (_penalize) {
            // El vendedor pierde el colateral bloqueado de esa orden.
            v.lockedCollateral -= amount;
            v.totalCollateral -= amount;
            IERC20 token = IERC20(_tokenAddress);
            require(token.transfer(feeWallet, amount), "Fallo envio del fee");
        } else {
            // Sin culpa: solo se desbloquea → vuelve a disponible interno.
            v.lockedCollateral -= amount;
        }

                delete orderLocks[_orderId];
        delete disputes[_orderId];

        emit DisputeResolved(_orderId, _penalize);
    }

    // 5b. EJECUCIÓN EXPLÍCITA (CASO EXTREMO) por el admin.
    //     Permite tomar el saldo BLOQUEADO de una orden puntual cuando el
    //     vendedor defraudó al comprador y corresponde rescatar esos USDT sin
    //     pasar por el ciclo de disputa. El monto va a feeWallet (proyecto/
    //     admin) para resarcir al comprador. Es una medida privativa: solo la
    //     invoca el backend admin en situaciones excepcionales y auditadas.
    function adminSeizeLocked(
        string memory _orderId,
        address _vendor,
        address _tokenAddress
    ) external onlyAdmin {
        uint256 amount = orderLocks[_orderId];
        require(amount > 0, "No hay saldo bloqueado para esta orden");
        require(!disputes[_orderId].isActive, "Resolver la disputa primero");

        Vendor storage v = vendors[_vendor];
        require(v.lockedCollateral >= amount, "Saldo bloqueado insuficiente");

        v.lockedCollateral -= amount;
        v.totalCollateral -= amount;
        IERC20 token = IERC20(_tokenAddress);
        require(token.transfer(feeWallet, amount), "Fallo envio a feeWallet");

        delete orderLocks[_orderId];
        emit CollateralSeized(_vendor, _orderId, amount);
    }

    // 6. LECTURA ÚTIL PARA DIAGNÓSTICO (saldo libre del vendedor)
    function vendorAvailable(address _vendor) external view returns (uint256) {
        return vendors[_vendor].totalCollateral - vendors[_vendor].lockedCollateral;
    }
}