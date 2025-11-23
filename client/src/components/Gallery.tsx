import { Loader } from "@/components/Loader";
import { useListGalleryItems } from "@/hooks";
import { Box, Flex, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { GalleryItem as GI } from "utils";
import { GalleryItem } from "./GalleryItem";

export const Gallery = ({ guildId, galleryName }: { guildId: string; galleryName: string }) => {
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
    <Flex id="gallery" w="full" h="full" pb="4rem">
      {errored ? (
        <div>Error: {error?.message ?? "Unknown error"}</div>
      ) : isLoading ? (
        <Loader text="Loading gallery..." full={true} />
      ) : data?.count && data.count > 0 ? (
        <Flex direction="column" gap="4" w="full">
          <Box padding="2" w="full" mx="auto" maxW="90%" columnCount={[1, 2, 3]} columnGap="8px">
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
