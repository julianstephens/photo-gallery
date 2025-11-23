import { Tooltip } from "@/components/ui/tooltip";
import { Image, Link } from "@chakra-ui/react";
import { useState } from "react";
import type { GalleryItem as GI } from "utils";

export interface GalleryItemProps {
  item: GI;
}

export const GalleryItem = ({ item }: GalleryItemProps) => {
  const [name] = useState(item.metadata?.name ?? item.name);

  return (
    <Tooltip content={name}>
      <Link w="fit" href={item.url} target="_blank" rel="noopener noreferrer">
        <Image w="100%" borderRadius="xl" mb="2" src={item.url} alt={name} loading="lazy" />
      </Link>
    </Tooltip>
  );
};
