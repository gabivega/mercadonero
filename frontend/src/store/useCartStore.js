import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCartStore = create(
  persist(
    (set, get) => ({
      cart: [],

      addToCart: (product) => {
        const currentCart = get().cart;
        
        // Usamos una constante para el ID para evitar el error del undefined
        const productId = product._id || product.id;

        if (!productId) {
          console.error("El producto no tiene un ID válido (id o _id):", product);
          return;
        }

        const existingItem = currentCart.find((item) => 
          (item._id || item.id) === productId
        );

        if (existingItem) {
          // Si ya existe, mapeamos y aumentamos cantidad
          const updatedCart = currentCart.map((item) =>
            (item._id || item.id) === productId
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
          set({ cart: updatedCart });
        } else {
          // Si es nuevo, lo agregamos
          // Tip: Forzamos que el objeto tenga un id consistente para las próximas comparaciones
          const newProduct = { ...product, quantity: 1 };
          set({ cart: [...currentCart, newProduct] });
        }
      },

      removeFromCart: (productId) => {
        set({ 
          cart: get().cart.filter((item) => (item._id || item.id) !== productId) 
        });
      },

      updateQuantity: (productId, newQuantity) => {

        const parsedQuantity = parseInt(newQuantity, 10);
        if (newQuantity <= 0) {
          // get().removeFromCart(productId);  
          return
        } else {
          set({
            cart: get().cart.map((item) =>
              (item._id || item.id) === productId 
                ? { ...item, quantity: parsedQuantity } 
                : item
            ),
          });
        }
      },

      clearCart: () => set({ cart: [] }),

      getTotalItems: () => get().cart.reduce((acc, item) => acc + item.quantity, 0),

      getTotalPrice: () => get().cart.reduce((acc, item) => {
        // Aseguramos que el precio sea un número para evitar errores de suma
        const price = Number(item.priceARS) || 0;
        return acc + (price * item.quantity);
      }, 0),
    }),
    { 
      name: 'cart-storage',
      // Opcional: Esto ayuda a que no haya problemas si cambias la estructura del store
      getStorage: () => localStorage, 
    }
  )
);