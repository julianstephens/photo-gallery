# Photo Gallery 5000

An easy to use webapp for viewing photos.

## Performance Optimizations

This application has been optimized for fast image loading and scalability:

### Image Delivery Architecture

- **Metadata-Only Listings**: Gallery listing endpoints return only image metadata (filename, dimensions, presigned URLs) rather than binary image data
- **Direct Image URLs**: Images are served via presigned S3 URLs, allowing browsers to cache and parallelize downloads
- **Lazy Loading**: Images use native browser lazy loading (`loading="lazy"`) to defer loading off-screen images
- **Cache-Control Headers**: The `/api/images/:galleryName/*` endpoint sets aggressive cache headers for CDN support

### CDN Integration (Recommended)

For optimal performance in production, deploy a CDN in front of the image serving endpoints:

1. **CloudFront/Cloudflare**: Configure a CDN to cache the `/api/images/*` endpoint
2. **Cache Policy**: Respect the `Cache-Control: public, max-age=31536000, immutable` headers set by the server
3. **Origin Shield**: Consider enabling origin shield to reduce load on the S3 bucket
4. **Geographic Distribution**: Use CDN edge locations to serve images from the closest geographic location to users

### S3 Presigned URLs

Images are served via presigned S3 URLs that:

- Expire after 1 hour (configurable in `BucketService.createPresignedUrl`)
- Allow direct browser access to S3 without proxying through the API server
- Enable browser-level caching and parallel downloads

### Performance Benefits

- **Reduced API Payload**: Gallery listings are ~95% smaller without binary image data
- **Faster Initial Load**: Metadata loads quickly; images stream in parallel
- **Better Scalability**: API server doesn't need to proxy image bytes
- **CDN-Ready**: Deterministic URLs enable efficient CDN caching
