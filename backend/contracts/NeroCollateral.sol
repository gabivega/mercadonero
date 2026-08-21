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
     *    - Si _feeAmount > 0 (flujo exitoso): el fee va al feeWallet y el resto
     *      se devuelve al vendedor.
     *    - Si _feeAmount == 0 (cancelación / orden expirada sin pago): se le
     *      devuelve TODO el monto congelado al vendedor.
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
        v.lockedCollateral -= amount;
        uint256 fee = _feeAmount;
        uint256 net = amount - fee;
        v.totalCollateral = v.totalCollateral - amount + net;

        delete orderLocks[_orderId];

        IERC20 token = IERC20(_tokenAddress);
        if (fee > 0) {
            require(token.transfer(feeWallet, fee), "Fallo envio del fee");
        }
        if (net > 0) {
            require(token.transfer(_vendor, net), "Fallo envio al vendedor");
        }

        emit CollateralReleased(_vendor, _orderId, net, fee);
    }

    // 4. EL BACKEND LLAMA AQUÍ SI EL COMPRADOR REPORTA UN PROBLEMA (Se congela la liberación)
    function triggerDispute(string memory _orderId) external onlyAdmin {
        uint256 amount = orderLocks[_orderId];
        require(amount > 0, "No hay saldo bloqueado");
        disputes[_orderId] = Dispute(true, amount);
        
        emit OrderDisputed(_orderId, amount);
    }

    // 5. RESOLUCIÓN DE DISPUTA POR EL ADMIN
    function resolveDispute(string memory _orderId, address _vendor, address _tokenAddress, bool _penalize) external onlyAdmin {
        require(disputes[_orderId].isActive, "No hay disputa activa");
        uint256 amount = disputes[_orderId].amount;
        Vendor storage v = vendors[_vendor];

        if (_penalize) {
            // El vendedor pierde el colateral
            v.totalCollateral -= amount; 
            IERC20 token = IERC20(_tokenAddress);
            token.transfer(admin, amount); // El admin retiene los fondos para resarcir al comprador manualmente
        }

        v.lockedCollateral -= amount; // En ambos casos se quita del saldo retenido temporalmente
        delete orderLocks[_orderId];
        delete disputes[_orderId];

                emit DisputeResolved(_orderId, _penalize);
    }

    // 6. LECTURA ÚTIL PARA DIAGNÓSTICO (saldo libre del vendedor)
    function vendorAvailable(address _vendor) external view returns (uint256) {
        return vendors[_vendor].totalCollateral - vendors[_vendor].lockedCollateral;
    }
}