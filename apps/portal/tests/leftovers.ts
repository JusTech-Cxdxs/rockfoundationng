/**
 * The names of the organisation this platform was first built for (its
 * group, plant, branch and bank partner). None of them belongs in the
 * D'Phoenix Autocare edition: tests/leftovers.test.ts checks the whole
 * repository, and the demo and knowledge tests check what they make.
 * This file is the one place the names are written.
 */
export const OLD_ORGANISATION = /kewalram|chanrai|\bKCG\b|afprint|isolo|keystone/i;

/**
 * A vehicle make the plant module (switched off) and the make and model
 * list know as a genuine brand: allowed there, nowhere else.
 */
export const PLANT_MAKE = /soueast/i;
