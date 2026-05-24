import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import {
  type ChartConfig,
  ChartContainer,
  ChartEmptyState,
  ChartLegendContent,
  ChartTooltipContent,
} from './chart';

const meta = {
  title: 'UI/Chart',
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ── Shared fixtures ───────────────────────────────────────────────────────────

const days = ['05/21', '05/22', '05/23', '05/24', '05/25'];

const lineData = days.map((label, i) => ({
  label,
  requests: 30 + i * 8 + Math.round(Math.random() * 10),
  errors: Math.round(Math.random() * 5),
}));

const durationData = days.map((label, i) => ({
  label,
  avgDurationMs: 400 + i * 50,
  p95DurationMs: 800 + i * 100,
}));

const tokenData = days.map((label, i) => ({
  label,
  inputTokens: 1000 + i * 200,
  outputTokens: 500 + i * 100,
}));

const rankingData = [
  { name: 'research-agent', value: 42 },
  { name: 'slide-agent', value: 28 },
  { name: 'kb-agent', value: 15 },
  { name: 'draft-agent', value: 9 },
  { name: 'review-agent', value: 5 },
];

// ── Line chart ────────────────────────────────────────────────────────────────

const lineConfig: ChartConfig = {
  requests: { label: 'Requests', color: 'hsl(221 83% 53%)' },
  errors: { label: 'Errors', color: 'hsl(0 84% 60%)' },
};

export const LineChartStory: Story = {
  name: 'Line Chart — multi-series',
  render: () => (
    <Card className="w-[480px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Requests & Errors</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={lineConfig}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="requests"
                name="Requests"
                stroke="var(--color-requests)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="errors"
                name="Errors"
                stroke="var(--color-errors)"
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  ),
};

// ── Area chart ────────────────────────────────────────────────────────────────

const tokenConfig: ChartConfig = {
  inputTokens: { label: 'Input', color: 'hsl(221 83% 53%)' },
  outputTokens: { label: 'Output', color: 'hsl(142 71% 45%)' },
};

export const AreaChartStory: Story = {
  name: 'Area Chart — stacked tokens',
  render: () => (
    <Card className="w-[480px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Tokens</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={tokenConfig}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={tokenData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="inputTokens"
                name="Input"
                stroke="var(--color-inputTokens)"
                fill="var(--color-inputTokens)"
                fillOpacity={0.2}
                stackId="tokens"
              />
              <Area
                type="monotone"
                dataKey="outputTokens"
                name="Output"
                stroke="var(--color-outputTokens)"
                fill="var(--color-outputTokens)"
                fillOpacity={0.2}
                stackId="tokens"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  ),
};

// ── Horizontal bar chart ──────────────────────────────────────────────────────

const rankingConfig: ChartConfig = {
  value: { label: 'Calls', color: 'hsl(221 83% 53%)' },
};

export const HorizontalBarChartStory: Story = {
  name: 'Bar Chart — horizontal ranking',
  render: () => (
    <Card className="w-[480px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Top Agents by Calls</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={rankingConfig}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={rankingData}
              layout="vertical"
              margin={{ left: 4, right: 16 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="hsl(var(--border))"
              />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
              <Tooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="value"
                name="Calls"
                fill="var(--color-value)"
                radius={[0, 3, 3, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  ),
};

// ── Empty state ───────────────────────────────────────────────────────────────

export const EmptyStateStory: Story = {
  name: 'Empty State',
  render: () => (
    <Card className="w-[480px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Requests</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartEmptyState />
      </CardContent>
    </Card>
  ),
};

// ── Loading state ─────────────────────────────────────────────────────────────

export const LoadingStateStory: Story = {
  name: 'Loading State',
  render: () => (
    <Card className="w-[480px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Requests</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  ),
};

// ── Legend ────────────────────────────────────────────────────────────────────

export const LegendContentStory: Story = {
  name: 'Legend Content',
  render: () => (
    <div className="w-[400px] rounded border p-4">
      <ChartLegendContent
        payload={[
          { value: 'Requests', color: 'hsl(221 83% 53%)' },
          { value: 'Errors', color: 'hsl(0 84% 60%)' },
          { value: 'Cancelled', color: 'hsl(38 92% 50%)' },
        ]}
      />
    </div>
  ),
};

// ── Latency dual-line ─────────────────────────────────────────────────────────

const durationConfig: ChartConfig = {
  avgDurationMs: { label: 'Avg', color: 'hsl(221 83% 53%)' },
  p95DurationMs: { label: 'P95', color: 'hsl(38 92% 50%)' },
};

export const DurationChartStory: Story = {
  name: 'Line Chart — dual latency (Avg + P95)',
  render: () => (
    <Card className="w-[480px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Latency</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={durationConfig}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={durationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}ms`} />
              <Tooltip
                content={<ChartTooltipContent formatter={(v) => `${Number(v)}ms`} />}
              />
              <Line
                type="monotone"
                dataKey="avgDurationMs"
                name="Avg"
                stroke="var(--color-avgDurationMs)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="p95DurationMs"
                name="P95"
                stroke="var(--color-p95DurationMs)"
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  ),
};
