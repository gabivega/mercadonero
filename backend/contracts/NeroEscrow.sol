// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title NeroEscrow (v2)
 * @notice Contrato de escrow para pagos P2P en criptomonedas (USDT/USDC/DAI/POL/ETH).
 *
 * v2 — SETTLE FLEXIBLE
 * ---------------------------------------------------------------------------
 * Se introduce settle(orderId, sellerAmount, feeAmount, refundAmount):
 * un unico metodo de cierre con PODER ABSOLUTO del admin que reparte el monto
 * retenido entre VENDEDOR, FEEWALLET y COMPRADOR (refund) segun montos explicitos.
 *
 * Regla de integridad: sellerAmount + feeAmount + refundAmount == amount.
 *   - refund SIEMPRE va al comprador (buyer del escrow).
 *   - fee SIEMPRE va a la feeWallet (puede ser 0).
 *   - permite refund parcial + pago parcial simultaneos (base para compras
 *     grupales / ajustes de precio futuros sin volver a redeployar).
 *
 * releaseOrder y cancelOrder se MANTIENEN por compatibilidad y ahora son
 * wrappers de settle:
 *   - releaseOrder(id) -> settle(id, sellerNet, fee, 0)   (fee = amount*feeBps/10000)
 *   - cancelOrder(id)  -> settle(id, 0, 0, amount)          (reembolso 100%)
 *
 * GAS / NATIVO
 * ---------------------------------------------------------------------------
 * El monto se guarda en una UNIDAD COMUN (menor precision entre token y nativo).
 * En fondeo nativo el value queda en el contrato y el gas consumido se descuenta
 * de ese balance; por eso el reparto nativo se calcula proporcionalmente sobre el
 * BALANCE REAL del contrato (no sobre amount), evitando reverts por sumas que
 * excedan el saldo disponible.
 */
contract NeroEscrow {
    address public admin;
    address public feeWallet;
    uint256 public feeBps; // Comision en puntos base. Ej: 300 = 3%

    struct Escrow {
        address buyer;
        address seller;
        // 0x0 = moneda nativa de la red; direccion = ERC20.
        address token;
        uint256 amount;     // Monto total retenido (productos + envio), unidad comun.
        bool deposited;     // El comprador fondeo.
        bool released;      // Ya se cerro (settled). Se mantiene el nombre por compat de ABI.
        uint256 createdAt;
    }

    // orderId (string) -> escrow
    mapping(string => Escrow) public escrows;

    event OrderFunded(string indexed orderId, address indexed buyer, address indexed seller, address token, uint256 amount);
    event OrderReleased(string indexed orderId, address indexed seller, uint256 sellerNet, uint256 fee);
    event OrderCancelled(string indexed orderId, address indexed buyer, uint256 amount);
    // Evento unificado de cierre (v2). Se emite SIEMPRE en settle().
    event OrderSettled(
        string indexed orderId,
        address indexed seller,
        address indexed buyer,
        uint256 sellerAmount,
        uint256 feeAmount,
        uint256 refundAmount
    );

    constructor() {
        admin = msg.sender;
        feeWallet = msg.sender;
        feeBps = 300; // Default 3%
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Solo Admin");
        _;
    }

    // -- CONFIGURACION (solo admin) --
    function setFeeWallet(address _newFeeWallet) external onlyAdmin {
        require(_newFeeWallet != address(0), "Direccion invalida");
        feeWallet = _newFeeWallet;
    }

    function changeAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Direccion invalida");
        admin = _newAdmin;
    }

    function setFeeBps(uint256 _feeBps) external onlyAdmin {
        require(_feeBps <= 5000, "Fee max 50%");
        feeBps = _feeBps;
    }

    // -- ESTADO / LECTURA --
    function isFunded(string memory _orderId) external view returns (bool) {
        return escrows[_orderId].deposited;
    }

    function isClosed(string memory _orderId) external view returns (bool) {
        return escrows[_orderId].released;
    }

    // --------------------------------------------------------------
    // 1. EL COMPRADOR FONDEA LA ORDEN (token ERC20, requiere approve previo)
    // --------------------------------------------------------------
    function fundOrder(
        string memory _orderId,
        address _buyer,
        address _seller,
        address _tokenAddress,
        uint256 _amount
    ) external {
        Escrow storage e = escrows[_orderId];
        require(!e.deposited, "Orden ya fondeada");
        require(_amount > 0, "Monto invalido");
        require(_seller != address(0) && _buyer != address(0), "Direccion invalida");
        require(_tokenAddress != address(0), "Token invalido");

        IERC20 token = IERC20(_tokenAddress);
        bool ok = token.transferFrom(msg.sender, address(this), _amount);
        require(ok, "Fallo transferencia");

        escrows[_orderId] = Escrow({
            buyer: _buyer,
            seller: _seller,
            token: _tokenAddress,
            amount: _amount,
            deposited: true,
            released: false,
            createdAt: block.timestamp
        });

        emit OrderFunded(_orderId, _buyer, _seller, _tokenAddress, _amount);
    }

    // --------------------------------------------------------------
    // 1.b EL COMPRADOR FONDEA LA ORDEN CON LA MONEDA NATIVA (POL/ETH)
    // --------------------------------------------------------------
    function fundOrderNative(
        string memory _orderId,
        address _buyer,
        address _seller,
        uint256 _amount
    ) external payable {
        Escrow storage e = escrows[_orderId];
        require(!e.deposited, "Orden ya fondeada");
        require(_amount > 0, "Monto invalido");
        require(_seller != address(0) && _buyer != address(0), "Direccion invalida");
        require(msg.value > 0, "Valor nativo requerido");

        escrows[_orderId] = Escrow({
            buyer: _buyer,
            seller: _seller,
            token: address(0), // nativo
            amount: _amount,
            deposited: true,
            released: false,
            createdAt: block.timestamp
        });

        emit OrderFunded(_orderId, _buyer, _seller, address(0), _amount);
    }

    // --------------------------------------------------------------
    // 2. SETTLE FLEXIBLE (solo admin) -- reparte el monto retenido.
    //    sellerAmount + feeAmount + refundAmount == amount.
    //    refund -> buyer ; fee -> feeWallet ; resto -> seller.
    // --------------------------------------------------------------
    function settle(
        string memory _orderId,
        uint256 _sellerAmount,
        uint256 _feeAmount,
        uint256 _refundAmount
    ) public onlyAdmin {
        Escrow storage e = escrows[_orderId];
        require(e.deposited, "No hay fondos");
        require(!e.released, "Orden ya cerrada");
        require(
            _sellerAmount + _feeAmount + _refundAmount == e.amount,
            "Suma no coincide con monto"
        );

        if (e.token == address(0)) {
            // -- Reparto NATIVO sobre el balance REAL del contrato --
            uint256 nativeTotal = address(this).balance;
            uint256 nativeSeller = e.amount > 0 ? (nativeTotal * _sellerAmount) / e.amount : 0;
            uint256 nativeFee = e.amount > 0 ? (nativeTotal * _feeAmount) / e.amount : 0;
            uint256 nativeRefund = nativeTotal - nativeSeller - nativeFee; // resto -> comprador

            if (nativeFee > 0) {
                (bool feeOk, ) = payable(feeWallet).call{value: nativeFee}("");
                require(feeOk, "Fallo envio fee nativo");
            }
            if (nativeSeller > 0) {
                (bool sellerOk, ) = payable(e.seller).call{value: nativeSeller}("");
                require(sellerOk, "Fallo envio vendedor nativo");
            }
            if (nativeRefund > 0) {
                (bool refundOk, ) = payable(e.buyer).call{value: nativeRefund}("");
                require(refundOk, "Fallo reembolso nativo");
            }
        } else {
            // -- Reparto ERC20 --
            IERC20 token = IERC20(e.token);
            if (_feeAmount > 0) {
                require(token.transfer(feeWallet, _feeAmount), "Fallo envio fee");
            }
            if (_sellerAmount > 0) {
                require(token.transfer(e.seller, _sellerAmount), "Fallo envio vendedor");
            }
            if (_refundAmount > 0) {
                require(token.transfer(e.buyer, _refundAmount), "Fallo reembolso");
            }
        }

        e.released = true; // cerrada -> evita doble settle.
        emit OrderSettled(_orderId, e.seller, e.buyer, _sellerAmount, _feeAmount, _refundAmount);
    }

    // --------------------------------------------------------------
    // 3. LIBERAR AL VENDEDOR (wrapper de settle). Mantiene compat.
    // --------------------------------------------------------------
    function releaseOrder(string memory _orderId) external onlyAdmin {
        Escrow storage e = escrows[_orderId];
        require(e.deposited, "No hay fondos");
        require(!e.released, "Orden ya cerrada");

        uint256 fee = (e.amount * feeBps) / 10000;
        uint256 sellerNet = e.amount - fee;

        settle(_orderId, sellerNet, fee, 0);
        emit OrderReleased(_orderId, e.seller, sellerNet, fee);
    }

    // --------------------------------------------------------------
    // 4. CANCELAR Y REEMBOLSAR 100% AL COMPRADOR (wrapper de settle).
    // --------------------------------------------------------------
    function cancelOrder(string memory _orderId) external onlyAdmin {
        Escrow storage e = escrows[_orderId];
        require(e.deposited, "No hay fondos");
        require(!e.released, "Orden ya cerrada");

        uint256 total = e.amount;
        settle(_orderId, 0, 0, total);
        emit OrderCancelled(_orderId, e.buyer, total);
    }
}
