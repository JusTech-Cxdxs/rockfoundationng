/**
 * Make and model suggestions for vehicle registration, split by the
 * Workshop's Passenger and Commercial sections. Suggestions only: Make and
 * Model are free text (see VehicleMakeModelPicker), so any make the workshop
 * services can be typed. The lists are the makes and models most often seen
 * in Nigerian workshops.
 */

export type VehicleCategory = 'PASSENGER' | 'COMMERCIAL';

export const VEHICLE_CATALOG: Record<VehicleCategory, Record<string, string[]>> = {
  PASSENGER: {
    Toyota: ['Corolla', 'Camry', 'RAV4', 'Highlander', 'Venza', 'Sienna', 'Yaris', 'Avalon', 'Prado', 'Land Cruiser', '4Runner'],
    Honda: ['Accord', 'Civic', 'CR-V', 'Pilot', 'Odyssey', 'City'],
    Lexus: ['RX 350', 'ES 350', 'GX 460', 'LX 570', 'IS 250', 'NX 200t'],
    Hyundai: ['Elantra', 'Sonata', 'Accent', 'Tucson', 'Santa Fe', 'Creta'],
    Kia: ['Rio', 'Cerato', 'Picanto', 'Sportage', 'Sorento'],
    Nissan: ['Almera', 'Sentra', 'Altima', 'X-Trail', 'Pathfinder', 'Murano'],
    'Mercedes-Benz': ['C-Class', 'E-Class', 'GLK', 'GLE', 'ML', 'GL'],
    Ford: ['Focus', 'Fusion', 'Escape', 'Edge', 'Explorer'],
    Peugeot: ['301', '406', '508', '3008', '5008'],
    Volkswagen: ['Golf', 'Jetta', 'Passat', 'Tiguan', 'Touareg'],
    Mitsubishi: ['Lancer', 'Outlander', 'Pajero'],
    Mazda: ['Mazda3', 'Mazda6', 'CX-5', 'CX-9'],
    Acura: ['TL', 'MDX', 'RDX', 'ZDX'],
    Infiniti: ['QX56', 'QX60', 'FX35'],
    Chevrolet: ['Cruze', 'Malibu', 'Captiva', 'Equinox'],
    Suzuki: ['Swift', 'Dzire', 'Grand Vitara'],
    Innoson: ['IVM G5', 'IVM Fox', 'IVM Umu'],
  },
  COMMERCIAL: {
    Toyota: ['Hilux', 'Hiace', 'Coaster', 'Land Cruiser Pick-up', 'Dyna'],
    Isuzu: ['D-Max', 'NPR', 'NQR', 'FVR'],
    Mitsubishi: ['L200', 'Canter', 'Fuso'],
    Nissan: ['Navara', 'Urvan', 'Cabstar'],
    Ford: ['Ranger', 'Transit'],
    'Mercedes-Benz': ['Sprinter', 'Actros', 'Axor'],
    Peugeot: ['Boxer', 'Partner', 'Landtrek'],
    Hyundai: ['H-1', 'H100'],
    Iveco: ['Daily', 'Trakker'],
    MAN: ['TGS', 'TGA'],
    DAF: ['CF', 'XF'],
  },
};

/**
 * Engine suggestions per make and model, only where the engine is well
 * known. The engine is the key for parts fitment: different models can share
 * one, and one model name can hide different engines (a Hilux with the 2.4
 * diesel or the 2.7 petrol). Engine stays free text.
 */
export const ENGINE_TYPE_CATALOG: Record<VehicleCategory, Record<string, Record<string, string[]>>> = {
  PASSENGER: {
    Toyota: {
      Corolla: ['2ZR-FE (1.8L Petrol)', '1ZZ-FE (1.8L Petrol)'],
      Camry: ['2AR-FE (2.5L Petrol)', '2GR-FE (3.5L V6 Petrol)', '2AZ-FE (2.4L Petrol)'],
      Highlander: ['2GR-FE (3.5L V6 Petrol)', '1AR-FE (2.7L Petrol)'],
      Sienna: ['2GR-FE (3.5L V6 Petrol)'],
    },
    Honda: {
      Accord: ['K24 (2.4L Petrol)', 'J35 (3.5L V6 Petrol)'],
      Civic: ['R18 (1.8L Petrol)', 'K20 (2.0L Petrol)'],
    },
    Lexus: {
      'RX 350': ['2GR-FE (3.5L V6 Petrol)'],
      'ES 350': ['2GR-FE (3.5L V6 Petrol)'],
    },
  },
  COMMERCIAL: {
    Toyota: {
      Hilux: ['2GD-FTV (2.4L Diesel)', '1GD-FTV (2.8L Diesel)', '2TR-FE (2.7L Petrol)', '2KD-FTV (2.5L Diesel)'],
      Hiace: ['1KD-FTV (3.0L Diesel)', '2TR-FE (2.7L Petrol)'],
      Coaster: ['1HZ (4.2L Diesel)', 'N04C (4.0L Diesel)'],
    },
    Isuzu: {
      NPR: ['4HK1 (5.2L Diesel)', '4JJ1 (3.0L Diesel)'],
      NQR: ['4HK1 (5.2L Diesel)'],
      'D-Max': ['4JJ1 (3.0L Diesel)', 'RZ4E (1.9L Diesel)'],
    },
  },
};

export function getMakesForCategory(category: VehicleCategory): string[] {
  return Object.keys(VEHICLE_CATALOG[category]);
}

/** Case-insensitive (Make is free text). Empty array for an unknown make. */
export function getModelsForMake(category: VehicleCategory, make: string): string[] {
  const entry = Object.entries(VEHICLE_CATALOG[category]).find(
    ([knownMake]) => knownMake.toLowerCase() === make.trim().toLowerCase(),
  );
  return entry?.[1] ?? [];
}

/** Case-insensitive; empty array when no suggestion is known. */
export function getEngineTypesForModel(category: VehicleCategory, make: string, model: string): string[] {
  const makeEntry = Object.entries(ENGINE_TYPE_CATALOG[category]).find(
    ([knownMake]) => knownMake.toLowerCase() === make.trim().toLowerCase(),
  );
  if (!makeEntry) return [];
  const modelEntry = Object.entries(makeEntry[1]).find(
    ([knownModel]) => knownModel.toLowerCase() === model.trim().toLowerCase(),
  );
  return modelEntry?.[1] ?? [];
}
