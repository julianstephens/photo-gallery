import { HStack, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";

const AdminRequestsPage = () => {
  const [numRequests] = useState(0);
  const pageTitle = "Admin Requests";
  const pageSlug = pageTitle.toLowerCase().replace(/\s+/g, "-");

  return (
    <VStack id={`${pageSlug}-container`}>
      <HStack id={`${pageSlug}-header`} w="100%" justify="start" mb={4}>
        <VStack id={`${pageSlug}-header-info`} gap="0.5">
          <Text>My Requests</Text>
          <Text color="gray.500">{numRequests} requests</Text>
        </VStack>
      </HStack>
    </VStack>
  );
};

export default AdminRequestsPage;
