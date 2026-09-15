/**
 * Pure formatting helpers shared by the account screens on both surfaces.
 * `money` lives with the animal view helpers so the price format (no decimals
 * on whole dollars, two when fractional, USD) has exactly one implementation.
 */
export { titleCase as titleCaseOr, relTime, ageLabel, sexLabel, formatMoney } from '@/domain/util';
export { money } from './animal-view';
