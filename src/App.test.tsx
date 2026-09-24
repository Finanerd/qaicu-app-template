import { render } from '@testing-library/react';
import App from './App.tsx';

// Mounts without throwing. Expand this (and add more *.test.tsx files) to cover
// the features you build.
test('App renders without crashing', () => {
  const { container } = render(<App />);
  expect(container).toBeTruthy();
});

// Guard: the starter placeholder must be gone before this can be deployed.
//
// ON A FRESH CLONE THIS TEST FAILS, AND THAT IS THE POINT — it is the template
// saying the app has not been written yet. Replace src/App.tsx and it passes.
// Keep it: it is what stops an empty placeholder from being deployed as an app.
test('App is implemented (placeholder removed)', () => {
  const { container } = render(<App />);
  expect(
    container.textContent ?? '',
    'src/App.tsx still holds the starter placeholder — write the app first.',
  ).not.toContain('Replace this component');
});
