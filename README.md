# Campaign Config Builder

Standalone UI for building, validating, importing, and exporting compact JSON campaign configs for Shopify Functions.

## What this tool does

- Edits top-level and campaign-level `allowed_codes` / `disallowed_codes`
- Supports `BundleDiscount` campaigns and requirement groups
- Applies runtime defaults for editing and validation:
  - `dt` defaults to `percentage`
  - `req.type` defaults to `pid`
  - `req.qty` defaults to `1`
- Exports compact JSON that omits default values
- Warns about runtime gating behavior when no code rules are configured

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## GitHub Pages deployment

This repo includes a GitHub Actions workflow to deploy `dist/` to GitHub Pages.

1. Push this project to its own repository.
2. In GitHub, enable Pages to use GitHub Actions.
3. Push to `main` to deploy.

## Integration workflow

1. Import an existing config JSON.
2. Make edits in the UI.
3. Copy compact JSON output.
4. Use that JSON in the existing Shopify function config pipeline.
