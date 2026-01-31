import { axiosInstance } from '../config/axiosConfig'

export type OllamaModelItem = { name: string; [key: string]: unknown }

export type OllamaModelsResponse = { models: OllamaModelItem[] }

export const getOllamaModels = async (): Promise<OllamaModelsResponse> => {
  const response = await axiosInstance.get('/guru/ollama/models')
  return response.data as OllamaModelsResponse
}
