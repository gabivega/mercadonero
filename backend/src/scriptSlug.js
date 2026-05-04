import fs from 'fs';
import allCategories from './allCategories.js';
/**
 * Convierte una cadena de texto en un slug limpio:
 * - Remueve acentos y caracteres especiales.
 * - Todo en minúsculas.
 * - Reemplaza espacios por guiones.
 */
const createSlug = (text) => {
  return text
    .toString()
    .normalize('NFD')                   // Descompone acentos
    .replace(/[\u0300-\u036f]/g, '')    // Elimina los diacríticos (acentos)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '')         // Quita todo lo que no sea letra, número o espacio
    .replace(/\s+/g, '-');              // Reemplaza espacios por guiones
};

/**
 * Procesa el array de categorías de forma recursiva
 */
const processCategories = (categories) => {
  return categories.map(cat => {
    const updatedCategory = {
      ...cat,
      slug: createSlug(cat.name)
    };

    if (cat.subcategories && cat.subcategories.length > 0) {
      updatedCategory.subcategories = processCategories(cat.subcategories);
    }

    return updatedCategory;
  });
};

const updatedData = processCategories(allCategories);

// Guardar el resultado en un nuevo archivo JS
const fileContent = `export const allCategories = ${JSON.stringify(updatedData, null, 2)};`;

fs.writeFile('categoriesWithSlugs.js', fileContent, (err) => {
  if (err) {
    console.error('Error escribiendo el archivo:', err);
  } else {
    console.log('¡Archivo generado con éxito: categoriesWithSlugs.js!');
  }
});