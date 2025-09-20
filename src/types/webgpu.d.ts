// WebGPU type declarations
interface Navigator {
  gpu?: GPU;
}

interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
}

interface GPUAdapter {
  // Add other GPUAdapter properties as needed
}
