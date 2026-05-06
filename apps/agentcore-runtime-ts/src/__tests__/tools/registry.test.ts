import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('tool registry', () => {
  const originalEnv = {
    ENABLE_TAVILY_TOOLS: process.env.ENABLE_TAVILY_TOOLS,
    ENABLE_WEATHER_TOOL: process.env.ENABLE_WEATHER_TOOL,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    process.env.ENABLE_TAVILY_TOOLS = originalEnv.ENABLE_TAVILY_TOOLS;
    process.env.ENABLE_WEATHER_TOOL = originalEnv.ENABLE_WEATHER_TOOL;
  });

  afterEach(() => {
    if (originalEnv.ENABLE_TAVILY_TOOLS === undefined) {
      delete process.env.ENABLE_TAVILY_TOOLS;
    } else {
      process.env.ENABLE_TAVILY_TOOLS = originalEnv.ENABLE_TAVILY_TOOLS;
    }

    if (originalEnv.ENABLE_WEATHER_TOOL === undefined) {
      delete process.env.ENABLE_WEATHER_TOOL;
    } else {
      process.env.ENABLE_WEATHER_TOOL = originalEnv.ENABLE_WEATHER_TOOL;
    }
  });

  it('uses defaults with weather disabled', async () => {
    const mod = await import('../../tools/registry.js');
    const config = mod.resolveToolRegistryConfigFromEnv();

    expect(config).toEqual({
      enableWeather: false,
      enableTavily: true,
      enablePresentation: true,
      enableCalculator: true,
      enableTableSummary: true,
    });

    const names = mod.getRegisteredTools().map((entry) => ({
      name: entry.name,
      enabled: entry.enabled,
    }));

    expect(names).toEqual([
      { name: 'date_resolver', enabled: true },
      { name: 'calculator', enabled: true },
      { name: 'table_summary', enabled: true },
      { name: 'tavily_search', enabled: true },
      { name: 'tavily_extract', enabled: true },
      { name: 'tavily_crawl', enabled: true },
      { name: 'tavily_map', enabled: true },
      { name: 'create_slide_presentation', enabled: true },
      { name: 'getWeather', enabled: false },
    ]);
  });

  it('honors env flags and preserves tool order', async () => {
    vi.stubEnv('ENABLE_TAVILY_TOOLS', 'false');
    vi.stubEnv('ENABLE_WEATHER_TOOL', 'true');

    const mod = await import('../../tools/registry.js');
    const registered = mod.getRegisteredTools();
    const enabledTools = mod.buildGeneralTools();
    const enabledNames = enabledTools.map((entry) => entry.name);

    expect(registered.find((entry) => entry.name === 'tavily_search')?.enabled).toBe(
      false,
    );
    expect(registered.find((entry) => entry.name === 'getWeather')?.enabled).toBe(true);
    expect(enabledTools).toHaveLength(5);
    expect(enabledNames).toEqual([
      'date_resolver',
      'calculator',
      'table_summary',
      'create_slide_presentation',
      'getWeather',
    ]);
    expect(registered.map((entry) => entry.name)).toEqual([
      'date_resolver',
      'calculator',
      'table_summary',
      'tavily_search',
      'tavily_extract',
      'tavily_crawl',
      'tavily_map',
      'create_slide_presentation',
      'getWeather',
    ]);
  });
});
