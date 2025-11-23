import { Loader } from "@/components/Loader";
import { useListGalleryItems } from "@/hooks";
import { ImageSize } from "@/utils";
import { createListCollection, Flex, Grid, GridItem, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { GalleryItem as GI } from "utils";
import { GalleryItem } from "./GalleryItem";
import { Select } from "./forms/Fields";

export const Gallery = ({ galleryName }: { galleryName: string }) => {
  const [errored, setErrored] = useState(false);
  const { data, isLoading, error } = useListGalleryItems(galleryName);
  const [selectedSize, setSelectedSize] = useState<string[]>([]);
  const [defaultImageSize] = useState<number>(ImageSize.SM);
  const imageSizes = createListCollection({
    items: [
      { label: "Small", value: `${ImageSize.SM}` },
      { label: "Medium", value: `${ImageSize.MD}` },
      { label: "Large", value: `${ImageSize.LG}` },
    ],
  });

  const updateImageSize = (size: string) => {
    setSelectedSize([size]);
  };

  useEffect(() => {
    if (error) {
      setErrored(true);
    } else {
      if (data && !isLoading) {
        setErrored(false);
      }
    }
    setSelectedSize([defaultImageSize.toString()]);
  }, [error, data, isLoading, defaultImageSize]);

  return (
    <Flex id="gallery" w="full" h="full">
      {errored ? (
        <div>Error: {error?.message ?? "Unknown error"}</div>
      ) : isLoading ? (
        <Loader text="Loading gallery..." full={true} />
      ) : data?.count && data.count > 0 ? (
        <Flex direction="column" gap="4" w="full">
          <Flex direction="row" align="last baseline" gap="4" w="50%">
            <Select
              options={imageSizes.items}
              name="imageSize"
              label="Image Size"
              useLabel={false}
              value={selectedSize}
              onChange={updateImageSize}
              invalid={false}
            />
            <Text flexShrink={0}>{data?.count ?? 0} items</Text>
          </Flex>
          <Grid templateColumns="repeat(auto-fill, minmax(150px, 1fr))" gap="4">
            {data?.contents.map((item: GI) => (
              <GridItem key={item.name}>
                <GalleryItem item={item} imageSize={parseInt(selectedSize[0])} />
              </GridItem>
            ))}
          </Grid>
        </Flex>
      ) : (
        <Text m="auto">No items found in this gallery.</Text>
      )}
    </Flex>
  );
};
