export const getGalleryData = async () => {
  const res = await fetch("/api/gallery");
  return await res.json();
};
