# Progress Tracker

A professional, single-page dashboard that visualizes Chess.com player data. Built with vanilla JavaScript and Chart.js.

## Quick Start

1.  Open `index.html` in your browser.
2.  Enter a Chess.com username (e.g., `hikaru`).
3.  Select time controls and click **Analyze**.

## Features

*   **Player Analysis**: Fetches public data via the Chess.com API.
*   **Interactive Charts**: Rating history, win rates, and game trends.
*   **Filtering**: Filter by time control (Bullet, Blitz, Rapid, Daily), color, and date range.
*   **Data Export**: Copy raw game data to clipboard for spreadsheets.
*   **Responsive Design**: Works on desktop and mobile with a clean, modern UI.

## Tech Stack

*   **Core**: Vanilla JavaScript (ES Modules), CSS3, HTML5.
*   **Visualization**: Chart.js.
*   **No Build Step**: Runs directly in the browser.

## Project Structure

*   `src/api.js`: API fetching and rate limiting.
*   `src/charts/`: Chart.js configurations.
*   `src/ui/`: DOM manipulation and UI updates.
*   `src/transform.js`: Data processing and statistics.
*   `src/state.js`: Global state management.

## License

For personal and educational use. Data provided by the [Chess.com Public API](https://www.chess.com/news/view/published-data-api).
