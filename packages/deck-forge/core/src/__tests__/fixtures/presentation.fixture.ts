import { fileURLToPath } from "node:url";

import type { PresentationIR } from "#src/index.js";

const HERO_IMAGE_PATH = fileURLToPath(new URL("../../../../assets/hero.png", import.meta.url));

export const presentationFixture: PresentationIR = {
  id: "deck-001",
  version: "1.0.0",
  meta: {
    title: "Q3 Business Review",
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:00.000Z",
    author: "deck-forge",
  },
  theme: {
    id: "theme-default",
    name: "Default",
    colors: {
      background: "#FFFFFF",
      surface: "#F8FAFC",
      textPrimary: "#0F172A",
      textSecondary: "#475569",
      primary: "#1D4ED8",
      secondary: "#0EA5E9",
      accent: "#14B8A6",
      chartPalette: ["#1D4ED8", "#0EA5E9", "#14B8A6", "#F59E0B"],
    },
    typography: {
      fontFamily: {
        heading: "Arial",
        body: "Arial",
        mono: "Courier New",
      },
      fontSize: {
        title: 40,
        heading: 28,
        body: 18,
        caption: 14,
        footnote: 12,
      },
      lineHeight: {
        tight: 1.1,
        normal: 1.4,
        relaxed: 1.7,
      },
      weight: {
        regular: 400,
        medium: 500,
        bold: 700,
      },
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 48,
    },
    radius: {
      none: 0,
      sm: 4,
      md: 8,
      lg: 12,
      full: 999,
    },
    slideDefaults: {
      backgroundColor: "#FFFFFF",
      padding: 24,
    },
    elementDefaults: {
      text: {
        fontFamily: "Arial",
        fontSize: 18,
        color: "#0F172A",
      },
    },
  },
  slides: [
    {
      id: "slide-title",
      index: 0,
      title: "Q3 Business Review",
      layout: {
        spec: {
          type: "title",
          density: "low",
          emphasis: "center",
        },
        slideSize: {
          width: 1280,
          height: 720,
          unit: "px",
        },
        regions: [
          {
            id: "title-region",
            role: "title",
            contentRefs: ["el-title"],
            priority: 1,
            frame: {
              x: 80,
              y: 160,
              width: 1120,
              height: 140,
            },
          },
        ],
      },
      elements: [
        {
          id: "el-title",
          type: "text",
          role: "title",
          text: {
            paragraphs: [
              {
                runs: [{ text: "Q3 Business Review" }],
                alignment: "center",
              },
            ],
          },
          frame: {
            x: 80,
            y: 160,
            width: 1120,
            height: 140,
          },
          style: {
            fontFamily: "Arial",
            fontSize: 40,
            color: "#0F172A",
            bold: true,
          },
        },
      ],
    },
    {
      id: "slide-text",
      index: 1,
      title: "Key Messages",
      layout: {
        spec: {
          type: "single_column",
          density: "medium",
          emphasis: "top",
        },
        slideSize: {
          width: 1280,
          height: 720,
          unit: "px",
        },
        regions: [
          {
            id: "body-region",
            role: "body",
            contentRefs: ["el-body"],
            priority: 1,
            frame: {
              x: 100,
              y: 170,
              width: 1080,
              height: 420,
            },
          },
        ],
      },
      elements: [
        {
          id: "el-body",
          type: "text",
          role: "body",
          text: {
            paragraphs: [
              {
                runs: [
                  { text: "Revenue grew 18% YoY with margin improvement in enterprise segment." },
                ],
                alignment: "left",
              },
            ],
          },
          frame: {
            x: 100,
            y: 170,
            width: 1080,
            height: 420,
          },
          style: {
            fontFamily: "Arial",
            fontSize: 24,
            color: "#0F172A",
          },
        },
      ],
    },
    {
      id: "slide-image",
      index: 2,
      title: "Product Snapshot",
      layout: {
        spec: {
          type: "hero",
          density: "low",
          emphasis: "visual",
        },
        slideSize: {
          width: 1280,
          height: 720,
          unit: "px",
        },
        regions: [
          {
            id: "visual-region",
            role: "visual",
            contentRefs: ["el-image"],
            priority: 1,
            frame: {
              x: 120,
              y: 120,
              width: 1040,
              height: 480,
            },
          },
        ],
      },
      elements: [
        {
          id: "el-image",
          type: "image",
          assetId: "asset-hero-001",
          role: "hero",
          frame: {
            x: 120,
            y: 120,
            width: 1040,
            height: 480,
          },
        },
      ],
    },
    {
      id: "slide-table",
      index: 3,
      title: "Segment Performance",
      layout: {
        spec: {
          type: "dashboard",
          density: "medium",
          emphasis: "data",
        },
        slideSize: {
          width: 1280,
          height: 720,
          unit: "px",
        },
        regions: [
          {
            id: "table-region",
            role: "table",
            contentRefs: ["el-table"],
            priority: 1,
            frame: {
              x: 100,
              y: 180,
              width: 1080,
              height: 380,
            },
          },
        ],
      },
      elements: [
        {
          id: "el-table",
          type: "table",
          frame: {
            x: 100,
            y: 180,
            width: 1080,
            height: 380,
          },
          headers: ["Segment", "Revenue", "Growth"],
          rows: [
            ["Enterprise", "$4.2M", "+24%"],
            ["SMB", "$2.1M", "+11%"],
          ],
          style: {
            headerFill: "#1D4ED8",
            borderColor: "#CBD5E1",
            textStyle: {
              fontFamily: "Arial",
              fontSize: 16,
              color: "#0F172A",
            },
          },
        },
      ],
    },
  ],
  assets: {
    assets: [
      {
        id: "asset-hero-001",
        type: "image",
        uri: HERO_IMAGE_PATH,
        mimeType: "image/png",
        metadata: {
          width: 1920,
          height: 1080,
          source: "external",
          createdAt: "2026-04-28T00:00:00.000Z",
        },
        usage: [
          {
            slideId: "slide-image",
            elementId: "el-image",
            role: "hero",
          },
        ],
      },
    ],
  },
  operationLog: [],
};
