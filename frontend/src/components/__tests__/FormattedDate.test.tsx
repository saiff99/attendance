import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { FormattedDate } from '../FormattedDate';

describe('FormattedDate component', () => {
  it('renders a hyphen when date is null or undefined', async () => {
    render(<FormattedDate date={null} />);
    await waitFor(() => {
      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });

  it('renders custom className correctly', async () => {
    const { container } = render(<FormattedDate date={null} className="custom-test-class" />);
    await waitFor(() => {
      const span = container.querySelector('span');
      expect(span).toHaveClass('custom-test-class');
    });
  });

  it('renders formatted date when a valid ISO string is provided', async () => {
    render(<FormattedDate date="2026-11-05T10:30:00Z" format="date" />);
    await waitFor(() => {
      expect(screen.getByText(/2026/)).toBeInTheDocument();
    });
  });
});
