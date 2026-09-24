import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfirmDialog, Dialog, Select, Combobox, Menu } from './ui';

// Harness-owned smoke tests for the picker/overlay kit: they mount in jsdom
// (see test-setup.ts for the polyfills) and render their labels.
describe('components kit', () => {
  it('Select and Combobox render with a label and the chosen value', () => {
    render(
      <>
        <Select label="Vaihe" value="Tarjous" onChange={() => {}} options={['Liidi', 'Tarjous']} />
        <Combobox label="Asiakas" value="a" onChange={() => {}} options={[{ value: 'a', label: 'Acme' }]} />
      </>,
    );
    expect(screen.getByText('Vaihe')).toBeInTheDocument();
    expect(screen.getByText('Tarjous')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Asiakas' })).toHaveTextContent('Acme');
  });

  it('Dialog and ConfirmDialog render their title when open, nothing when closed', () => {
    const { rerender } = render(<Dialog open onOpenChange={() => {}} title="New row">content</Dialog>);
    expect(screen.getByRole('dialog')).toHaveTextContent('New row');
    rerender(<Dialog open={false} onOpenChange={() => {}} title="New row">content</Dialog>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    render(<ConfirmDialog open onOpenChange={() => {}} title="Delete?" onConfirm={() => {}} confirmLabel="Delete" />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('Menu renders its trigger', () => {
    render(<Menu label="New" items={[{ label: 'Row', onSelect: () => {} }]} />);
    expect(screen.getByRole('button', { name: /New/ })).toBeInTheDocument();
  });
});
