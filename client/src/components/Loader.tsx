import { Flex, Spinner } from "@chakra-ui/react";

export const Loader = ({ text, full = true }: { text?: string; full?: boolean }) => {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      width={full ? "100%" : "auto"}
      height={full ? "100%" : "auto"}
      gap={4}
    >
      <Spinner />
      {text && <span>{text}</span>}
    </Flex>
  );
};
