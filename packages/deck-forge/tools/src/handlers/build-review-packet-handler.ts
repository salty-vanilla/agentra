import { HtmlSlideImageRenderer, buildReviewPacket } from "@deck-forge/core";

import type { BuildReviewPacketInput, BuildReviewPacketOutput } from "#src/types.js";

export async function buildReviewPacketHandler(
  input: BuildReviewPacketInput,
): Promise<BuildReviewPacketOutput> {
  const renderer =
    input.renderImages === true ? (input.renderer ?? new HtmlSlideImageRenderer()) : input.renderer;
  const packet = await buildReviewPacket({
    userRequest: input.userRequest,
    presentation: input.presentation,
    validationReport: input.validationReport,
    grounding: input.grounding,
    renderImages: input.renderImages,
    slideIds: input.slideIds,
    imageFormat: input.imageFormat,
    imageScale: input.imageScale,
    renderer,
  });

  return {
    packet: {
      ...packet,
      slideImages: packet.slideImages?.map((image) => ({
        slideId: image.slideId,
        mimeType: image.mimeType,
        dataBase64: Buffer.from(image.data).toString("base64"),
        width: image.width,
        height: image.height,
        source: image.source,
        renderer: image.renderer,
      })),
    },
  };
}
