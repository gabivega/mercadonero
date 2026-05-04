import Cart from '../models/Cart.js';

export const getCart = async (req, res) => {
  try {
    // El userId suele venir del middleware de auth (req.user.id)
    const userId = req.user.id; 
    console.log("en get cart, id:", userId)
    const cart = await Cart.findOne({ user: userId }).populate({
      path: 'items.product',
      select: 'title priceARS images stock listingType sale' // Traemos solo lo necesario
    });

    if (!cart) {
      return res.status(200).json({ items: [] });
    }

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener el carrito", error });
  }
};

export const syncCart = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("en sync cart, id:", userID)
    const { items } = req.body; // Array de { product: id, quantity: numero }

    // findOneAndUpdate busca por usuario. 
    // Si no existe, upsert: true lo crea.
    // new: true devuelve el objeto actualizado.
    const updatedCart = await Cart.findOneAndUpdate(
      { user: userId },
      { 
        items, 
        updatedAt: Date.now() 
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(updatedCart);
  } catch (error) {
    res.status(500).json({ message: "Error al sincronizar el carrito", error });
  }
};

