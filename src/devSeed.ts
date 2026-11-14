// Development convenience: fill empty Settings from .env.development.local,
// so a fresh dev browser does not need the key and model list typed in again.
//
// Runs only under `yarn start`. CRA does not read .env.development.local for
// production builds, and the NODE_ENV check lets the bundler drop this code,
// so the key can never end up in the deployed site.
export function seedDevSettings(): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const apiKey = process.env.REACT_APP_OPENROUTER_API_KEY;
  if (apiKey && !localStorage.getItem('openrouter_api_key')) {
    localStorage.setItem('openrouter_api_key', apiKey);
  }

  const models = process.env.REACT_APP_DEV_MODELS;
  if (models && !localStorage.getItem('selected_models')) {
    const list = models
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => ({ id, name: id }));
    localStorage.setItem('selected_models', JSON.stringify(list));
  }
}
