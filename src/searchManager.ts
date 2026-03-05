/**
 * Manages search state with debouncing
 */
export class SearchManager {
    private searchTimeout: NodeJS.Timeout | undefined;
    private _currentSearchTerm: string = '';

    constructor(private readonly onSearchChange: (term: string) => void) {}

    /**
     * Get the current search term
     */
    get currentSearchTerm(): string {
        return this._currentSearchTerm;
    }

    /**
     * Perform search with debouncing
     * @param term - The search term to filter by
     * @param debounceMs - Debounce delay in milliseconds (default: 300)
     */
    search(term: string, debounceMs: number = 300): void {
        // Clear existing timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        // Set new timeout
        this.searchTimeout = setTimeout(() => {
            this._currentSearchTerm = term.toLowerCase().trim();
            this.onSearchChange(this._currentSearchTerm);
        }, debounceMs);
    }

    /**
     * Clear the current search
     */
    clearSearch(): void {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        this._currentSearchTerm = '';
        this.onSearchChange('');
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
    }
}
