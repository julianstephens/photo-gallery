import { Tooltip } from "@/components/ui/tooltip";
import { AspectRatio, Box, Center, Image, Link, Skeleton, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { GalleryItem as GI } from "utils";

export interface GalleryItemProps {
  item: GI;
}

export const GalleryItem = ({ item }: GalleryItemProps) => {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const name = item.metadata?.name ?? item.name;
  const isLoaded = status === "loaded";
  const hasError = status === "error";
  const isLoading = status === "loading";

  return (
    <Tooltip content={name}>
      <Link
        display="inline-block"
        w="full"
        href={`/media/${item.url}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <AspectRatio ratio={1} w="full" mb="2">
          <Box position="relative" borderRadius="xl" overflow="hidden">
            <Skeleton
              variant="shine"
              position="absolute"
              inset={0}
              colorPalette="gray"
              filter="blur(8px)"
              opacity={isLoading ? 1 : 0}
              pointerEvents="none"
              transition="opacity 0.3s ease"
            />
            {!hasError ? (
              <Image
                w="100%"
                h="100%"
                objectFit="cover"
                src={`/media/${item.url}`}
                alt={name}
                loading="lazy"
                opacity={isLoaded ? 1 : 0}
                transition="opacity 0.2s ease"
                onLoad={() => setStatus("loaded")}
                onError={() => setStatus("error")}
              />
            ) : (
              <Center w="100%" h="100%" bg="gray.900">
                <Text fontSize="sm" color="gray.300">
                  Preview unavailable
                </Text>
              </Center>
            )}
          </Box>
        </AspectRatio>
      </Link>
    </Tooltip>
  );
};
