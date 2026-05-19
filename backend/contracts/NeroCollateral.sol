// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract NeroCollateral {
    address public admin;
    
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
    event CollateralReleased(address indexed vendor, string orderId, uint256 amount);
    event OrderDisputed(string orderId, uint256 amount);
    event DisputeResolved(string orderId, bool penalized);

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Solo Admin");
        _;
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

    // 3. EL BACKEND LIBERA EL SALDO SI TODO SALIÓ BIEN (Comprador pagó, Vendedor confirmó)
    function releaseOrderCollateral(string memory _orderId, address _vendor, address _tokenAddress) external onlyAdmin {
        require(!disputes[_orderId].isActive, "Hay una disputa activa");
        uint256 amount = orderLocks[_orderId];
        require(amount > 0, "No hay saldo bloqueado para esta orden");

        Vendor storage v = vendors[_vendor];
        v.totalCollateral -= amount;
        v.lockedCollateral -= amount;
        
        delete orderLocks[_orderId];

        // Se le envían los dólares crypto al Comprador/Admin según el flujo, 
        // o si es garantía devuelta al vendedor, se le transfiere de vuelta:
        IERC20 token = IERC20(_tokenAddress);
        bool success = token.transfer(_vendor, amount); 
        require(success, "Fallo el envio de tokens");

        emit CollateralReleased(_vendor, _orderId, amount);
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
}