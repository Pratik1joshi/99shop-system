// Currency formatting utility for Nepali Rupees.
// en-IN grouping is how amounts are written in Nepal: Rs 1,25,000.00.
const rupees = (digits) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const twoDp = rupees(2);
const noDp = rupees(0);

export const formatCurrency = (amount) => `Rs ${twoDp.format(Number(amount) || 0)}`

export const formatCurrencyShort = (amount) => `Rs ${noDp.format(Number(amount) || 0)}`
