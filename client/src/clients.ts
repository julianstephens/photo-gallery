import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

export const queryClient = new QueryClient();

export const httpClient = axios.create({
  baseURL: "/api",
  withCredentials: true,
});
