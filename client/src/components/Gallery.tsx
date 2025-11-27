import { Loader } from "@/components/Loader";
import { useListGalleryItems } from "@/hooks";
import { Box, Flex, HStack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { GalleryItem as GI } from "utils";
import { GalleryItem } from "./GalleryItem";

interface GalleryProps {
  guildId: string;
  galleryName: string;
  includeHeader?: boolean;
  columnCount?: number;
}

export const Gallery = ({
  guildId,
  galleryName,
  includeHeader = true,
  columnCount = 3,
}: GalleryProps) => {
  const [errored, setErrored] = useState(false);
  const { data, isLoading, error } = useListGalleryItems(guildId, galleryName);

  useEffect(() => {
    if (error) {
      setErrored(true);
    } else {
      if (data && !isLoading) {
        setErrored(false);
      }
    }
  }, [error, data, isLoading]);

  return (
    <Flex id={`gallery-${galleryName}`} w="full" h="full" pb="4rem">
      {errored ? (
        <div>Error: {error?.message ?? "Unknown error"}</div>
      ) : isLoading ? (
        <Loader text="Loading gallery..." full={true} />
      ) : data?.count && data.count > 0 ? (
        <Flex id={`gallery-content-${galleryName}`} direction="column" gap="4" w="full">
          {includeHeader && (
            <HStack id={`gallery-header-${galleryName}`} justify="center" px="4">
              <Text fontWeight="bold">
                {galleryName} ({data.count} items)
              </Text>
            </HStack>
          )}
          <Box
            id={`gallery-items-${galleryName}`}
            w="full"
            columnCount={columnCount}
            columnGap="8px"
          >
            {data?.contents.map((item: GI) => (
              <GalleryItem key={item.name} item={item} />
            ))}
          </Box>
        </Flex>
      ) : (
        <Text m="auto">No items found in this gallery.</Text>
      )}
    </Flex>
  );
};
