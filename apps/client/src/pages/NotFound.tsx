import { Flex, Heading, Link, Text } from "@chakra-ui/react";

const NotFoundPage = () => (
  <Flex w="full" h="full" direction="column" align="center" justify="center" gap="4">
    <Heading>404 Not Found</Heading>
    <Text>
      The page you are looking for does not exist. <Link href="/home">Go back home</Link>
    </Text>
  </Flex>
);

export default NotFoundPage;
