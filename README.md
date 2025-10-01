# Color Swatcher

Color Swatcher is an interactive playground for exploring how hue, saturation, and lightness affect the color names surfaced by [the color api](https://www.thecolorapi.com/).

Built with React Router, Vite, and Tailwind CSS, the project showcases modern data loading patterns including optimistic updates, streaming responses, and graceful error states. 

Notable techniques and choices:
- Use a divide and conquer approach to segment the hue space and display colors; (e.g. we start at the entire hue space, checking 0, 180, and 360, and then subdivide the remaining space into 0-180 and 180-360, etc. and as long as we're seeing new colors, we keep subdividing)
- Streaming response with ndjson to progressively update the UI as colors are discovered (otherwise it would just sit and load for ~seconds)
- Use react-router minimalist template as this is not intended to be a production app; used react-router node to handle the "backend for frontend" aspects (if this were more intended for production I'd probably use a heavier template like [Epic Stack](https://github.com/epicweb-dev/epic-stack/tree/main))
- Not engineered specifically for mobile but the UI is responsive (changes as screen size changes)
- Note: the source data appears to have some errors, such as including multiple similar color names (e.g. "Screamin' Green" and "Screamin Green" at S/L 97/69) -- some attempts were made to "cleanse" the data on output, but such duplication may affect the fidelity of the results (a bound with color X at a beginning, middle, and endpoint but with a different color Y between those points may not output the color Y)
- I assumed only whole numbers were relevant here -- the color api is somewhat poorly documented

## To run

- `npm install`
- `npm run dev`

This should run the app at `http://localhost:5173`.

## To build

- `npm run build`

## To test

- `npm run test`