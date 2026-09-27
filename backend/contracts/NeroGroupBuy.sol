// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title NeroGroupBuy (v2 - multi-unidad)
 * @notice Escrow para COMPRAS GRUPALES ("Social Selling") en BSC.
 *
 * MODELO DE NEGOCIO
 * ──────────────────────────────────────────────────────────────────────
 * Un vendedor habilita la compra en grupo en un producto. Los compradores se
 * juntan y el PRECIO UNITARIO BAJA a medida que se suman más PERSONAS (los
 * tiers los define el vendedor: {2: precioArs, 3: ..., 4: ..., 5: ...}).
 * TODOS los compradores terminan pagando el PRECIO UNITARIO FINAL (el más bajo).
 *
 * CANTIDAD DE UNIDADES (v2):
 *   Cada comprador puede pedir N UNIDADES (no es rígido 1 por persona). Por
 *   eso el Member guarda `units`. El monto que congela cada comprador es:
 *       lockedAmount = units * priceUnitArs(tier actual) / rateAtLock
 *   y al liberar se calcula todo sobre `priceFinalUnitUsd * units`.
 *
 * Cada comprador tiene además una ORDEN INDIVIDUAL propia (snapshot, logística)
 * creada por el backend (igual que una orden común).
 *
 * Al cerrarse el grupo (se llena, o vence el plazo con >= 2 compradores), el
 * backend fija el PRECIO FINAL UNITARIO en USDT (precio final ARS / TDC de
 * cierre). A partir de ahí las órdenes figuran como "pagadas".
 *
 * LIBERACIÓN PARCIAL: a medida que cada comprador confirma la recepción, se
 * libera AL VENDEDOR solo la porción de ESE comprador, neta de fee:
 *     totalFinal = priceFinalUnitUsd * units
 *     sellerNet  = totalFinal - fee
 *     refund     = lockedAmount - totalFinal
 *
 * CASO EXPIRACIÓN SIN CONCRETAR (queda 1 solo comprador):
 *   se devuelve al creador el 100% de su saldo congelado, SIN fee
 *   (refundCreator).
 *
 * FEE: lo paga el VENDEDOR, sobre el total que recibe, y va a `feeWallet`.
 *      El fee es GLOBAL (feeBps, settable por el admin).
 *
 * DECIMALES: se usa 18 decimales (USDT en BSC mainnet y testnet tiene 18).
 *            El redondeo a 2 decimales es responsabilidad de la capa de
 *            presentación/negocio (backend/frontend), no del contrato.
 *
 * STOCK: la validación/reserva de stock vive en el BACKEND (Mongo). El
 *        contrato solo congela el USDT y no conoce el inventario.
 *
 * QUIÉN FIRMA QUÉ:
 *   - createGroup / joinGroup: el COMPRADOR (firma desde el front con Privy).
 *     Requiere haber hecho `approve` al token antes.
 *   - closeGroup / releaseMember / refundCreator / config: el ADMIN (backend),
 *     con la wallet admin (WALLET_PK).
 * ──────────────────────────────────────────────────────────────────────
 */
contract NeroGroupBuy {
    address public admin;
    address public feeWallet;
    uint256 public feeBps; // Comisión en puntos base. Ej: 300 = 3%

    // Snapshot de un comprador dentro del grupo.
    struct Member {
        address buyer;        // wallet del comprador
        address token;        // token usado (USDT)
        uint256 lockedAmount; // USDT congelado (18 dec)
        uint256 units;        // cantidad de unidades adquiridas (>= 1)
        uint256 priceArs;     // precio UNITARIO (ARS) al momento de entrar (snapshot)
        uint256 rateAtLock;   // TDC (ARS por USDT) usado al congelar (snapshot)
        bool funded;          // ya congeló su saldo
        bool released;        // ya se le liberó/reintegró su porción
    }

    struct Group {
        string groupId;         // id Mongo del Pool
        address seller;         // wallet destino de los fondos (dueño de la publicación)
        address creator;        // quién creó el grupo (primer comprador)
        address token;          // token de escrow del grupo (USDT)
        uint8 targetBuyers;     // objetivo de PERSONAS (ej: 5)
        uint8 memberCount;      // cuántos compradores efectivamente congelaron
        uint256 priceFinalUsd;  // USDT POR UNIDAD fijado al cerrar
        bool closed;            // ya se cerró (llenó o venció con >= 2)
        bool executed;          // se liquidó al menos una porción (o se devolvió)
        bool refunded;          // expiró con 1 buyer -> devolución íntegra
        Member[] members;
    }

    // groupId (string) -> Group
    mapping(string => Group) internal groups;

    // ── EVENTOS ──────────────────────────────────────────────────────
    event GroupCreated(
        string indexed groupId,
        address indexed creator,
        address indexed seller,
        address token,
        uint8 targetBuyers,
        uint256 amount,
        uint256 units
    );
    event GroupJoined(
        string indexed groupId,
        address indexed buyer,
        uint256 amount,
        uint256 units,
        uint256 priceArs,
        uint256 rateAtLock
    );
    event GroupClosed(string indexed groupId, uint256 priceFinalUnitUsd, uint8 members);
    event MemberReleased(
        string indexed groupId,
        address indexed buyer,
        address indexed seller,
        uint256 units,
        uint256 sellerNet,
        uint256 fee,
        uint256 refund
    );
    event GroupRefunded(string indexed groupId, address indexed creator, uint256 amount);

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
     * @dev El backend controla el % de comisión. El contrato lo cobra al
     *      liberar cada porción del vendedor.
     */
    function setFeeBps(uint256 _feeBps) external onlyAdmin {
        require(_feeBps <= 5000, "Fee max 50%");
        feeBps = _feeBps;
    }

    // ──────────────────────────────────────────────────────────────
    // 1. CREAR EL GRUPO: el creador congela su saldo (primer comprador).
    //    Requiere approve previo del token al contrato.
    //    `_amount` = _units * precioUnitarioArs / _rateAtLock (calculado en backend).
    // ──────────────────────────────────────────────────────────────
    function createGroup(
        string memory _groupId,
        address _seller,
        address _tokenAddress,
        uint8 _targetBuyers,
        uint256 _units,
        uint256 _amount,
        uint256 _priceArs,
        uint256 _rateAtLock
    ) external {
        Group storage g = groups[_groupId];
        require(g.creator == address(0), "Grupo ya existe");
        require(_seller != address(0), "Seller invalido");
        require(_tokenAddress != address(0), "Token invalido");
        require(_targetBuyers >= 2, "Minimo 2 compradores");
        require(_units >= 1, "Unidades minimas");
        require(_amount > 0, "Monto invalido");

        require(
            IERC20(_tokenAddress).transferFrom(msg.sender, address(this), _amount),
            "Fallo transferencia"
        );

        g.groupId = _groupId;
        g.seller = _seller;
        g.creator = msg.sender;
        g.token = _tokenAddress;
        g.targetBuyers = _targetBuyers;
        g.priceFinalUsd = 0;
        g.closed = false;
        g.executed = false;
        g.refunded = false;

        g.members.push(
            Member({
                buyer: msg.sender,
                token: _tokenAddress,
                lockedAmount: _amount,
                units: _units,
                priceArs: _priceArs,
                rateAtLock: _rateAtLock,
                funded: true,
                released: false
            })
        );
        g.memberCount = 1;

        emit GroupCreated(
            _groupId,
            msg.sender,
            _seller,
            _tokenAddress,
            _targetBuyers,
            _amount,
            _units
        );
        emit GroupJoined(_groupId, msg.sender, _amount, _units, _priceArs, _rateAtLock);
    }

    // ──────────────────────────────────────────────────────────────
    // 2. SUMARSE AL GRUPO: cada comprador nuevo congela su saldo por SUS
    //    unidades. El backend calcula `_amount`. Requiere approve previo.
    // ──────────────────────────────────────────────────────────────
    function joinGroup(
        string memory _groupId,
        uint256 _units,
        uint256 _amount,
        uint256 _priceArs,
        uint256 _rateAtLock
    ) external {
        Group storage g = groups[_groupId];
        require(g.creator != address(0), "Grupo no existe");
        require(!g.closed, "Grupo cerrado");
        require(g.memberCount < g.targetBuyers, "Grupo completo");
        require(_units >= 1, "Unidades minimas");
        require(_amount > 0, "Monto invalido");
        require(msg.sender != g.seller, "El vendedor no puede unirse");

        // Evitar doble membresía.
        for (uint256 i = 0; i < g.members.length; i++) {
            require(g.members[i].buyer != msg.sender, "Ya estas en el grupo");
        }

        require(
            IERC20(g.token).transferFrom(msg.sender, address(this), _amount),
            "Fallo transferencia"
        );

        g.members.push(
            Member({
                buyer: msg.sender,
                token: g.token,
                lockedAmount: _amount,
                units: _units,
                priceArs: _priceArs,
                rateAtLock: _rateAtLock,
                funded: true,
                released: false
            })
        );
        g.memberCount += 1;

        emit GroupJoined(_groupId, msg.sender, _amount, _units, _priceArs, _rateAtLock);
    }

    // ──────────────────────────────────────────────────────────────
    // 3. CERRAR EL GRUPO (admin). Se llama cuando:
    //    - se llenó (memberCount == targetBuyers), o
    //    - venció el plazo con >= 2 compradores.
    //    Fija el PRECIO FINAL UNITARIO en USDT (precioFinalArs / TDC de cierre).
    //    NO transfiere nada: las liberaciones son parciales.
    // ──────────────────────────────────────────────────────────────
    function closeGroup(string memory _groupId, uint256 _priceFinalUnitUsd) external onlyAdmin {
        Group storage g = groups[_groupId];
        require(g.creator != address(0), "Grupo no existe");
        require(!g.closed, "Grupo ya cerrado");
        require(g.memberCount >= 2, "Minimo 2 compradores");
        require(_priceFinalUnitUsd > 0, "Precio final invalido");
        g.closed = true;
        g.priceFinalUsd = _priceFinalUnitUsd;
        emit GroupClosed(_groupId, _priceFinalUnitUsd, g.memberCount);
    }

    // ──────────────────────────────────────────────────────────────
    // 4. LIBERAR LA PORCIÓN DE UN COMPRADOR (admin).
    //    El comprador confirmó la recepción. Se envía al VENDEDOR el
    //    (priceFinalUnitUsd * units) - fee, se cobra el fee a feeWallet y se
    //    REINTEGRA al comprador (lockedAmount - priceFinalUnitUsd * units).
    // ──────────────────────────────────────────────────────────────
    function releaseMember(string memory _groupId, address _buyer) external onlyAdmin {
        Group storage g = groups[_groupId];
        require(g.creator != address(0), "Grupo no existe");
        require(g.closed, "Grupo no cerrado");
        require(!g.refunded, "Grupo reembolsado");

        Member storage m = _findMember(g, _buyer);
        require(m.funded, "El comprador no fondeo");
        require(!m.released, "Porcion ya liberada");

        uint256 totalFinal = g.priceFinalUsd * m.units;
        // Invariante: no se puede liberar más de lo que el comprador congeló.
        require(totalFinal <= m.lockedAmount, "Precio final > monto congelado");

        uint256 fee = (totalFinal * feeBps) / 10000;
        uint256 sellerNet = totalFinal - fee;
        uint256 refund = m.lockedAmount - totalFinal;

        m.released = true;
        g.executed = true;

        IERC20 token = IERC20(g.token);
        if (sellerNet > 0) {
            require(token.transfer(g.seller, sellerNet), "Fallo envio vendedor");
        }
        if (fee > 0) {
            require(token.transfer(feeWallet, fee), "Fallo envio fee");
        }
        if (refund > 0) {
            require(token.transfer(m.buyer, refund), "Fallo reintegro");
        }

        emit MemberReleased(
            _groupId,
            m.buyer,
            g.seller,
            m.units,
            sellerNet,
            fee,
            refund
        );
    }

    // ──────────────────────────────────────────────────────────────
    // 5. EXPIRACIÓN SIN CONCRETAR (admin). Quedó 1 solo comprador:
    //    se devuelve el 100% del saldo congelado al creador, SIN fee.
    // ──────────────────────────────────────────────────────────────
    function refundCreator(string memory _groupId) external onlyAdmin {
        Group storage g = groups[_groupId];
        require(g.creator != address(0), "Grupo no existe");
        require(!g.closed, "Grupo ya cerrado");
        require(g.memberCount == 1, "Solo aplica con 1 comprador");
        require(!g.refunded, "Grupo ya reembolsado");

        Member storage m = g.members[0];
        require(m.funded, "El creador no fondeo");
        require(!m.released, "Ya liberado");

        uint256 amount = m.lockedAmount;
        m.released = true;
        g.refunded = true;
        g.executed = true;

        require(IERC20(g.token).transfer(m.buyer, amount), "Fallo reembolso");

        emit GroupRefunded(_groupId, m.buyer, amount);
    }

    // ──────────────────────────────────────────────────────────────
    // LECTURAS
    // ──────────────────────────────────────────────────────────────
    function isClosed(string memory _groupId) external view returns (bool) {
        return groups[_groupId].closed;
    }

    function isRefunded(string memory _groupId) external view returns (bool) {
        return groups[_groupId].refunded;
    }

    function membersCount(string memory _groupId) external view returns (uint256) {
        return groups[_groupId].members.length;
    }

    /// @notice Datos base del grupo (sin el array de miembros, para gas/UI).
    function getGroup(string memory _groupId)
        external
        view
        returns (
            address seller,
            address creator,
            address token,
            uint8 targetBuyers,
            uint8 memberCount,
            uint256 priceFinalUsd,
            bool closed,
            bool executed,
            bool refunded
        )
    {
        Group storage g = groups[_groupId];
        return (
            g.seller,
            g.creator,
            g.token,
            g.targetBuyers,
            g.memberCount,
            g.priceFinalUsd,
            g.closed,
            g.executed,
            g.refunded
        );
    }

    /// @notice Datos de un miembro por índice.
    function getMember(string memory _groupId, uint256 _index)
        external
        view
        returns (
            address buyer,
            uint256 lockedAmount,
            uint256 units,
            uint256 priceArs,
            uint256 rateAtLock,
            bool funded,
            bool released
        )
    {
        Member storage m = groups[_groupId].members[_index];
        return (
            m.buyer,
            m.lockedAmount,
            m.units,
            m.priceArs,
            m.rateAtLock,
            m.funded,
            m.released
        );
    }

    /// @notice Estado de un comprador puntual (por wallet).
    function getMemberByAddress(string memory _groupId, address _buyer)
        external
        view
        returns (bool exists, uint256 lockedAmount, uint256 units, bool released)
    {
        Group storage g = groups[_groupId];
        for (uint256 i = 0; i < g.members.length; i++) {
            if (g.members[i].buyer == _buyer) {
                return (
                    true,
                    g.members[i].lockedAmount,
                    g.members[i].units,
                    g.members[i].released
                );
            }
        }
        return (false, 0, 0, false);
    }

    // ── INTERNOS ──
    function _findMember(Group storage g, address _buyer)
        internal
        view
        returns (Member storage)
    {
        for (uint256 i = 0; i < g.members.length; i++) {
            if (g.members[i].buyer == _buyer) {
                return g.members[i];
            }
        }
        revert("Comprador no encontrado");
    }
}
