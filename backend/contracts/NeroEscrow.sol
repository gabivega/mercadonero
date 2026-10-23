// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title NeroEscrow
 * @notice Contrato de escrow para pagos P2P en criptomonedas (USDT/USDC/DAI).
 * 
 * Flujo tipo "arbitraje simple":
 *   1. El COMPRADOR fondea una orden (aprueba el token y deposita el monto total,
 *      incluido el envío, en el contrato). No necesita colateral.
 *   2. El VENDEDOR despacha el pedido tras ver el pago retenido en el contrato.
 *   3. Cuando el cliente confirma la recepción (o un trigger automático en el
 *      futuro), el ADMIN (backend) firma releaseOrder() y se envía al vendedor
 *      el monto neto (total - fee) y el fee a la feeWallet.
 *   4. Si la operación se cancela (vendedor, comprador o admin), el ADMIN firma
 *      cancelOrder() y se devuelve el 100% al comprador.
 *
 * SOLO la wallet del ADMIN puede liberar (releaseOrder) o cancelar (cancelOrder).
 * El fee es GLOBAL (settable por el admin vía setFeeBps) para que el backend
 * controle el % de comisión y no dependa del frontend.
 *
 * ── GAS / NATIVO ─────────────────────────────────────────────────────────────
 * Además del fondeo por token (fundOrder), se agregó fundOrderNative() para
 * permitir pagar con la moneda NATIVA de la red (POL en Polygon Amoy, ETH en
 * Base Sepolia, tBNB en BSC Testnet). Esto es OBLIGATORIO en redes donde la
 * smart wallet de Crossmint (ERC-4337 / paymaster sponsor) NO puede pagar gas
 * con la stablecoin de prueba: el comprador firma el fondeo pagando gas con la
 * moneda nativa y el contrato retiene ese valor hasta liberarlo/reembolsarlo.
 *
 * El monto se guarda en una UNIDAD COMÚN (la de menor precisión entre el token
 * y el nativo). El backend elige el token "espejo" para liberar/reembolsar:
 *   - fondeo por token  → release/cancel usan la dirección del token.
 *   - fondeo nativo     → release/cancel usan address(0) y envían el nativo.
 */
contract NeroEscrow {
    address public admin;
    address public feeWallet;
    uint256 public feeBps; // Comisión en puntos base. Ej: 300 = 3%

    struct Escrow {
        address buyer;
        address seller;
        // 0x0 = moneda nativa de la red; dirección = ERC20.
        address token;
        uint256 amount;     // Monto total retenido (productos + envío).
        bool deposited;     // El comprador fondeó.
        bool released;      // Ya se cerró (liberado al vendedor O reembolsado).
        uint256 createdAt;
    }

    // orderId (string) -> escrow
    mapping(string => Escrow) public escrows;

    event OrderFunded(string indexed orderId, address indexed buyer, address indexed seller, address token, uint256 amount);
    event OrderReleased(string indexed orderId, address indexed seller, uint256 sellerNet, uint256 fee);
    event OrderCancelled(string indexed orderId, address indexed buyer, uint256 amount);

    constructor() {
        admin = msg.sender;
        feeWallet = msg.sender;
        feeBps = 300; // Default 3%
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Solo Admin");
        _;
    }

    // ── CONFIGURACIÓN (solo admin) ──
    function setFeeWallet(address _newFeeWallet) external onlyAdmin {
        require(_newFeeWallet != address(0), "Direccion invalida");
        feeWallet = _newFeeWallet;
    }

    function changeAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Direccion invalida");
        admin = _newAdmin;
    }

    /**
     * @notice Setea la comisión global en puntos base (ej: 300 = 3%).
     * @dev El backend controla el % de comisión. El contrato cobra este %
     *      automáticamente en releaseOrder y exige un mínimo de integridad.
     */
    function setFeeBps(uint256 _feeBps) external onlyAdmin {
        require(_feeBps <= 5000, "Fee max 50%");
        feeBps = _feeBps;
    }

    // ── ESTADO / LECTURA ──
    /// @notice Lee si una orden ya fue fondeada.
    function isFunded(string memory _orderId) external view returns (bool) {
        return escrows[_orderId].deposited;
    }

    /// @notice Lee si una orden ya fue liberada o reembolsada (cerrada).
    function isClosed(string memory _orderId) external view returns (bool) {
        return escrows[_orderId].released;
    }

    // ──────────────────────────────────────────────────────────────
    // 1. EL COMPRADOR FONDEA LA ORDEN (firmada desde el front con su wallet)
    //    Requiere que el comprador haya hecho approve del token al contrato.
    // ──────────────────────────────────────────────────────────────
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

        // Solo soportamos tokens ERC20 (USDT / USDC / DAI).
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

    // ──────────────────────────────────────────────────────────────
    // 1.b EL COMPRADOR FONDEA LA ORDEN CON LA MONEDA NATIVA (POL/ETH/tBNB)
    //     El valor debe venir adjunto en la transacción.
    // ──────────────────────────────────────────────────────────────
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

    // ──────────────────────────────────────────────────────────────
    // 2. EL ADMIN LIBERA LOS FONDOS AL VENDEDOR.
    //    Se cobra el fee global (feeBps) a la feeWallet y el resto al seller.
    // ──────────────────────────────────────────────────────────────
    function releaseOrder(string memory _orderId) external onlyAdmin {
        Escrow storage e = escrows[_orderId];
        require(e.deposited, "No hay fondos");
        require(!e.released, "Orden ya cerrada");

        uint256 fee = (e.amount * feeBps) / 10000;
        uint256 sellerNet = e.amount - fee;

        // ⚠️ El equivalente NATIVO a transferir se calcula del balance real del
        // contrato (no de `amount`): `amount` está en la unidad común (la de
        // menor precisión), y pasar eso directamente al transfer nativo podría
        // intentar enviar MÁS de lo que el contrato tiene, revirtiendo.
        uint256 nativeTotal = address(this).balance;
        uint256 nativeFee = e.amount > 0 ? (nativeTotal * fee) / e.amount : 0;
        uint256 nativeSellerNet = e.amount > 0
            ? (nativeTotal - nativeFee)
            : nativeTotal;

        if (e.token == address(0)) {
            if (nativeFee > 0) {
                (bool feeOk, ) = payable(feeWallet).call{value: nativeFee}("");
                require(feeOk, "Fallo envio fee nativo");
            }
            if (nativeSellerNet > 0) {
                (bool sellerOk, ) = payable(e.seller).call{value: nativeSellerNet}("");
                require(sellerOk, "Fallo envio vendedor nativo");
            }
        } else {
            IERC20 token = IERC20(e.token);
            if (fee > 0) {
                require(token.transfer(feeWallet, fee), "Fallo envio fee");
            }
            require(token.transfer(e.seller, sellerNet), "Fallo envio vendedor");
        }

        e.released = true;
        emit OrderReleased(_orderId, e.seller, sellerNet, fee);
    }

    // ──────────────────────────────────────────────────────────────
    // 3. EL ADMIN CANCELA LA ORDEN Y DEVUELVE EL 100% AL COMPRADOR.
    // ──────────────────────────────────────────────────────────────
    function cancelOrder(string memory _orderId) external onlyAdmin {
        Escrow storage e = escrows[_orderId];
        require(e.deposited, "No hay fondos");
        require(!e.released, "Orden ya cerrada");

        if (e.token == address(0)) {
            // On-chain, el 100% de lo depositado en nativo sigue en el contrato.
            uint256 nativeTotal = address(this).balance;
            require(nativeTotal > 0, "Sin fondos nativos");
            (bool okBuyer, ) = payable(e.buyer).call{value: nativeTotal}("");
            require(okBuyer, "Fallo reembolso nativo");
        } else {
            IERC20 token = IERC20(e.token);
            require(token.transfer(e.buyer, e.amount), "Fallo reembolso");
        }

        e.released = true; // Se marca cerrada para evitar doble cancelación.
        emit OrderCancelled(_orderId, e.buyer, e.amount);
    }
}
