/** Decode identity only, never navigate to arbitrary QR destinations. */
export function verificationToken(
  payload: string,
  origin = window.location.origin,
  publicOrigin = import.meta.env.VITE_PUBLIC_BASE_URL || origin,
) {
  const value = payload.trim()
  if (/^[A-Za-z0-9_-]{16,128}$/.test(value)) return value
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("Use a Decypher verification QR or opaque token.")
  }
  if (
    ![origin, new URL(publicOrigin).origin].includes(url.origin) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("External or malformed QR links are not allowed.")
  const match = /^\/verify\/([A-Za-z0-9_-]{16,128})$/.exec(url.pathname)
  if (!match)
    throw new Error("This QR is not an evidence verification identity.")
  return match[1]
}

/** Small local perspective preview/download; never replaces the original File. */
export async function editedCapture(
  file: File,
  corners: number[][],
  rotation: number,
): Promise<Blob> {
  if (
    corners.length !== 4 ||
    corners.some(
      (p) =>
        p.length !== 2 || p.some((n) => !Number.isFinite(n) || n < 0 || n > 1),
    )
  )
    throw new Error("Invalid crop coordinates.")
  for (let i = 0; i < 4; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 4],
      c = corners[(i + 2) % 4]
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 0)
      throw new Error("Crop corners must form a clockwise convex document.")
  }
  const bitmap = await createImageBitmap(file),
    source = document.createElement("canvas")
  source.width = bitmap.width
  source.height = bitmap.height
  source.getContext("2d")!.drawImage(bitmap, 0, 0)
  bitmap.close()
  const pixels = source
    .getContext("2d")!
    .getImageData(0, 0, source.width, source.height)
  const points = corners.map((p) => [
    p[0] * (source.width - 1),
    p[1] * (source.height - 1),
  ])
  const distance = (a: number[], b: number[]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1])
  let width = Math.max(
      distance(points[0], points[1]),
      distance(points[3], points[2]),
    ),
    height = Math.max(
      distance(points[0], points[3]),
      distance(points[1], points[2]),
    )
  const scale = Math.min(1, Math.sqrt(2_000_000 / (width * height)))
  width = Math.max(2, Math.round(width * scale))
  height = Math.max(2, Math.round(height * scale))
  const uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    matrix: number[][] = []
  for (let i = 0; i < 4; i++) {
    const [u, v] = uv[i],
      [x, y] = points[i]
    matrix.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x], [
      0,
      0,
      0,
      u,
      v,
      1,
      -y * u,
      -y * v,
      y,
    ])
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column
    for (let row = column + 1; row < 8; row++)
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column]))
        pivot = row
    ;[matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]]
    const divisor = matrix[column][column]
    if (Math.abs(divisor) < 1e-8) throw new Error("Crop is too small.")
    matrix[column] = matrix[column].map((n) => n / divisor)
    for (let row = 0; row < 8; row++)
      if (row !== column) {
        const factor = matrix[row][column]
        matrix[row] = matrix[row].map((n, i) => n - factor * matrix[column][i])
      }
  }
  const h = matrix.map((row) => row[8]),
    canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")!,
    image = context.createImageData(width, height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1),
        v = y / (height - 1),
        denominator = h[6] * u + h[7] * v + 1,
        sx = Math.max(
          0,
          Math.min(
            source.width - 1,
            Math.round((h[0] * u + h[1] * v + h[2]) / denominator),
          ),
        ),
        sy = Math.max(
          0,
          Math.min(
            source.height - 1,
            Math.round((h[3] * u + h[4] * v + h[5]) / denominator),
          ),
        ),
        from = (sy * source.width + sx) * 4,
        to = (y * width + x) * 4
      image.data.set(pixels.data.subarray(from, from + 4), to)
    }
  context.putImageData(image, 0, 0)
  const rotated = document.createElement("canvas")
  rotated.width = rotation % 180 ? height : width
  rotated.height = rotation % 180 ? width : height
  const destination = rotated.getContext("2d")!
  destination.translate(rotated.width / 2, rotated.height / 2)
  destination.rotate((rotation * Math.PI) / 180)
  destination.drawImage(canvas, -width / 2, -height / 2)
  return new Promise((resolve, reject) =>
    rotated.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not export crop.")),
      "image/png",
    ),
  )
}
