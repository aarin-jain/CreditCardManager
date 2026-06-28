# CreditCardManager

A small browser-based monthly spending tracker for credit card CSV imports, manual transactions, and category budgets.

## Features

- Import common credit card CSV exports
- Manually add transactions
- Track monthly spending by category budget
- Export a CSV backup of transactions
- Persist data in the browser across refreshes
- Restore from `data/spending.csv` when browser storage is empty and the app is served locally

## Run

Open `index.html` in a browser, or serve the folder with a static server.

```bash
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765`.
