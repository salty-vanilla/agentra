# Frontend Architecture

## Component Separation Rules

Agentra's frontend follows a **Container / Presenter / Hook** pattern.

### Presenter (Presentational) Component

- Receives all data via props — no API calls, no global state reads
- Renders UI only; no side effects
- Typeable as a pure function: `(props: Props) => JSX.Element`
- Can be rendered in Storybook with fixture data alone
- Location: `components/` or `features/<domain>/components/`

**Rule of thumb:** If you can't display a component in Storybook without spinning up the backend, it is not a Presenter — extract its logic.

```tsx
// Good: pure presenter
export const ProgressSummaryCard: FC<{ events: ProgressSummaryEvent[] }> = ({ events }) => { ... }

// Bad: fetching inside the component
export const ProgressSummaryCard = () => {
  const { data } = useQuery(progressQuery) // ← violates presenter rule
  ...
}
```

### Container Component

- Connects data to presenters: fetches, subscribes, reads context
- Owns no visual markup beyond layout wrappers
- Lives in `features/<domain>/` or directly in `app/`
- Example: `AgentraWorkspace` — orchestrates SSE, model selection, progress state

### Custom Hook

- Extracts reusable stateful logic from containers
- Naming convention: `use<Domain><Action>` (e.g., `useSlideCommand`, `useChatStream`)
- Location: `hooks/` (global) or `features/<domain>/hooks/`
- Must be testable via RTL's `renderHook`

---

## Storybook Usage

Storybook is a **quality gate**, not just a visual catalog.

- **Every Presenter should have a Story** — if it doesn't, it's a tracking item.
- **Stories double as acceptance criteria** — they document the UI states that must work.
- **Storybook-unfriendly component = over-coupled** — if a component needs complex setup to render in Storybook, it should be refactored into Container + Presenter.

### Story structure

```tsx
// components/my-component.stories.tsx
const meta = {
  title: 'Domain/ComponentName',
  component: MyComponent,
  tags: ['autodocs'],
} satisfies Meta<typeof MyComponent>

export default meta
type Story = StoryObj<typeof meta>

// One export per meaningful UI state
export const Default: Story = { args: { ... } }
export const WithError: Story = { args: { ... } }
export const Empty: Story = { args: { ... } }
```

### MSW for API-dependent stories

For components that need API data (e.g., containers shown in a story for documentation purposes), override MSW handlers per-story:

```tsx
import { http, HttpResponse } from 'msw'
import { handlers } from '@/mocks/handlers'

export const WithData: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/threads', () => HttpResponse.json([...fixtureThreads])),
      ],
    },
  },
}
```

### Fixtures

Keep reusable test data in `features/<domain>/fixtures/` or alongside the story file:

```
features/chat/
  fixtures/
    messages.ts      ← fixture data
  components/
    chat-message.tsx
    chat-message.stories.tsx
```

---

## Testing with Vitest + React Testing Library

### Run tests

```bash
pnpm --filter @agentra/frontend test
```

### Test structure

Follow the **AAA (Arrange-Act-Assert)** pattern:

```tsx
it('shows error state when API fails', async () => {
  // Arrange
  render(<MyComponent status="error" message="Failed" />)

  // Act — nothing (static render)

  // Assert
  expect(screen.getByRole('alert')).toHaveTextContent('Failed')
})
```

### What to test in component tests

- Presence and visibility of key UI elements per state
- User interactions (click, type) and resulting state changes
- Accessibility: roles, labels, aria attributes
- Do NOT test implementation details (class names, internal state variables)

### File locations

```
components/__tests__/    ← component tests
lib/__tests__/           ← utility/hook tests
features/<domain>/__tests__/
```

---

## UI State Checklist

For each component, ensure Storybook stories cover:

- [ ] Default / happy path
- [ ] Empty / no data
- [ ] Loading / in-progress
- [ ] Error
- [ ] Long content / edge data
- [ ] Mobile viewport (use `parameters.viewport`)

---

関連ドキュメント: [testing-strategy.md](./testing-strategy.md)
