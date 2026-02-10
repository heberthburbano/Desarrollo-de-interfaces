/**
 * CurrencyService
 * Handles conversion rates from external API
 */
class CurrencyService {
    constructor() {
        this.apiBase = 'https://api.exchangerate-api.com/v4/latest/';
    }

    /**
     * Get conversion rate from one currency to another
     * @param {string} from - Source currency code (e.g., 'USD')
     * @param {string} to - Target currency code (e.g., 'EUR')
     * @returns {Promise<number>} - Conversion rate
     */
    async getRate(from, to) {
        try {
            const response = await fetch(`${this.apiBase}${from}`);
            if (!response.ok) throw new Error('Network response was not ok');

            const data = await response.json();
            const rate = data.rates[to];

            if (!rate) throw new Error(`Rate not found for ${to}`);

            return rate;
        } catch (error) {
            console.error('Currency API Error:', error);
            throw error;
        }
    }
}

// Make globally available
window.CurrencyService = CurrencyService;
