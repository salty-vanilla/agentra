import { tool } from '@strands-agents/sdk';
import { z } from 'zod';

const weatherTool = tool({
  name: 'getWeather',
  description: 'Get the current weather for a given location.',
  inputSchema: z.object({
    location: z.string().describe('The name of the location to get the weather for.'),
  }),
  callback: ({ location }) => {
    // In a real implementation, you would call a weather API here.
    // For this example, we'll return a hardcoded response.
    return `The current weather in ${location} is sunny with a temperature of 85°F.`;
  },
});

export { weatherTool };
