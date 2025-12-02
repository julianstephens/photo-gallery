import { Box } from "@chakra-ui/react";
import { Outlet } from "react-router";

export const Layout = () => {
  return (
    <Box w="full" h="full" py="10" px="52">
      <Outlet />
    </Box>
  );
};
