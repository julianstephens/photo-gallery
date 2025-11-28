import { Box, Image, type ImageProps } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { ImageGradient } from "utils";

export interface BlurredImageProps
  extends Pick<ImageProps, "alt" | "loading" | "objectFit" | "borderRadius"> {
  /** The high-resolution image source URL */
  src: string;
  /** Width of the image container */
  width?: string | number;
  /** Height of the image container */
  height?: string | number;
  /** Gradient metadata from the API, providing css, blurDataUrl, and fallback colors */
  gradient?: ImageGradient | null;
  /** Fallback primary color (hex) when gradient metadata is missing */
  fallbackPrimary?: string;
  /** Fallback secondary color (hex) when gradient metadata is missing */
  fallbackSecondary?: string;
}

const DEFAULT_FALLBACK_PRIMARY = "#2D3748"; // gray.700
const DEFAULT_FALLBACK_SECONDARY = "#1A202C"; // gray.800

/**
 * BlurredImage component that displays a gradient placeholder with an optional
 * blurred data URL layer, then transitions smoothly to the real image once loaded.
 */
export const BlurredImage = ({
  src,
  alt,
  width = "100%",
  height = "100%",
  gradient,
  fallbackPrimary = DEFAULT_FALLBACK_PRIMARY,
  fallbackSecondary = DEFAULT_FALLBACK_SECONDARY,
  loading = "lazy",
  objectFit = "cover",
  borderRadius,
}: BlurredImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [blurError, setBlurError] = useState(false);

  // Reset internal state when the source image changes so each asset loads independently
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
    setBlurError(false);
  }, [src, gradient?.blurDataUrl]);

  // Determine the background CSS gradient
  const backgroundCss =
    gradient?.css ?? `linear-gradient(135deg, ${fallbackPrimary} 0%, ${fallbackSecondary} 100%)`;

  // Determine if we have a blur data URL to show as an intermediate layer
  const blurDataUrl = gradient?.blurDataUrl;

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
  };

  const handleBlurError = () => {
    setBlurError(true);
  };

  // Show blur placeholder if:
  // - blurDataUrl exists AND hasn't errored AND (main image hasn't loaded OR main image errored)
  const showBlurPlaceholder = blurDataUrl && !blurError && (!isLoaded || hasError);

  return (
    <Box
      position="relative"
      width={width}
      height={height}
      overflow="hidden"
      borderRadius={borderRadius}
      background={backgroundCss}
    >
      {/* Blurred placeholder layer (if available) */}
      {showBlurPlaceholder && (
        <Image
          position="absolute"
          top={0}
          left={0}
          width="100%"
          height="100%"
          src={blurDataUrl}
          alt=""
          objectFit={objectFit}
          opacity={1}
          transition="opacity 0.3s ease-in-out"
          aria-hidden="true"
          loading="eager"
          onError={handleBlurError}
        />
      )}

      {/* Full resolution image */}
      {!hasError && (
        <Image
          position="absolute"
          top={0}
          left={0}
          width="100%"
          height="100%"
          src={src}
          alt={alt}
          objectFit={objectFit}
          loading={loading}
          onLoad={handleLoad}
          onError={handleError}
          opacity={isLoaded ? 1 : 0}
          transition="opacity 0.3s ease-in-out"
        />
      )}
    </Box>
  );
};
