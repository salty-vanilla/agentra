import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ChartContainer,
  ChartEmptyState,
  ChartLegendContent,
  ChartTooltipContent,
  useChart,
} from '@/components/ui/chart';

const config = {
  requests: { label: 'Requests', color: 'var(--chart-1)' },
  errors: { label: 'Errors', color: 'var(--destructive)' },
};

describe('ChartContainer', () => {
  it('renders children', () => {
    render(
      <ChartContainer config={config}>
        <div data-testid="child">content</div>
      </ChartContainer>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('injects CSS variables for config keys', () => {
    const { container } = render(
      <ChartContainer config={config}>
        <div />
      </ChartContainer>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.getPropertyValue('--color-requests')).toBe('var(--chart-1)');
    expect(wrapper.style.getPropertyValue('--color-errors')).toBe('var(--destructive)');
  });

  it('throws if useChart is used outside ChartContainer', () => {
    function BadComponent() {
      useChart();
      return null;
    }
    expect(() => render(<BadComponent />)).toThrow(
      'useChart must be used inside ChartContainer',
    );
  });
});

describe('ChartTooltipContent', () => {
  it('renders nothing when not active', () => {
    const { container } = render(
      <ChartTooltipContent active={false} payload={[]} label="May 25" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when payload is empty', () => {
    const { container } = render(
      <ChartTooltipContent active payload={[]} label="May 25" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders label and payload rows when active', () => {
    render(
      <ChartTooltipContent
        active
        label="May 25"
        payload={[
          { name: 'Requests', value: 42, color: '#3b82f6' },
          { name: 'Errors', value: 3, color: '#ef4444' },
        ]}
      />,
    );
    expect(screen.getByText('May 25')).toBeInTheDocument();
    expect(screen.getByText('Requests')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('applies custom formatter to values', () => {
    render(
      <ChartTooltipContent
        active
        payload={[{ name: 'Duration', value: 1500 }]}
        formatter={(v) => `${Number(v)}ms`}
      />,
    );
    expect(screen.getByText('1500ms')).toBeInTheDocument();
  });

  it('applies custom labelFormatter to label', () => {
    render(
      <ChartTooltipContent
        active
        label="raw-label"
        payload={[{ name: 'X', value: 1 }]}
        labelFormatter={(l) => `Formatted: ${l}`}
      />,
    );
    expect(screen.getByText('Formatted: raw-label')).toBeInTheDocument();
  });
});

describe('ChartLegendContent', () => {
  it('renders nothing with empty payload', () => {
    const { container } = render(<ChartLegendContent payload={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders legend items', () => {
    render(
      <ChartLegendContent
        payload={[
          { value: 'Requests', color: '#3b82f6' },
          { value: 'Errors', color: '#ef4444' },
        ]}
      />,
    );
    expect(screen.getByText('Requests')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
  });
});

describe('ChartEmptyState', () => {
  it('renders default message', () => {
    render(<ChartEmptyState />);
    expect(screen.getByText('この期間のデータはありません。')).toBeInTheDocument();
  });

  it('renders custom message', () => {
    render(<ChartEmptyState message="Nothing here yet." />);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });
});
