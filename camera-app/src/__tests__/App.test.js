import { render, screen } from '@testing-library/react';
import App from '../components/App/App';

test('renders the main header text', () => {
  render(<App />);
  const headerElement = screen.getByText(/Live Camera Feed/i);
  expect(headerElement).toBeInTheDocument();
});
