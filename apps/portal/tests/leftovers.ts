/**
 * The names of the other organisations EJO editions were built for (their
 * groups, plants, branches, addresses, partners and the demo fleets they
 * used). None of them belongs in the Rock Foundation Automobile edition:
 * tests/leftovers.test.ts checks the whole repository, and the demo and
 * knowledge tests check what they make. This file is the one place the
 * names are written.
 */
export const OLD_ORGANISATION = /kewalram|chanrai|\bKCG\b|afprint|isolo|keystone|d['’]?phoenix|victoria island|muri okunola|sandfill|zinox|\bratel\b|isuzu[ -]nigeria|seepco|rcl africa|nairda|desicon|dori construction|inspiration fm/i;

/**
 * A vehicle make the previous edition's assembly plant built: a genuine
 * brand in the make and model list, nowhere else.
 */
export const PLANT_MAKE = /soueast/i;
