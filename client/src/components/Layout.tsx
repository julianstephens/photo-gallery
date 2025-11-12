import { Box } from "@chakra-ui/react";
import { Outlet } from "react-router";

export const Layout = () => {
  return (
    <Box w="full" h="full" p="10">
      <Outlet />
    </Box>
  );
};
