import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../../config/config'
import { chatRequestSchema, chatResponseSchema } from '../../schemas/restSchemas'
export const GuruChat = () => {
    const [message, setMessage] = useState('')
    const [response, setResponse] = useState("")
    const [loading, setLoading] = useState(false)
    const [conversation_id, setConversationId] = useState<string | null>(null)
    const textRef = useRef<HTMLParagraphElement>(null)

    useEffect(() => {
        if (textRef.current) {
            textRef.current.innerHTML += response
            textRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [response])
    const handleSubmit = async () => {
            setLoading(true)
            const payload = {
                message: message,
                conversation_id: conversation_id || null,
            }
            const validatedPayload = chatRequestSchema.parse(payload)
            const url = new URL(`${API_URL}/guru/chat/stream`)
            url.searchParams.set('payload', JSON.stringify(validatedPayload))
            const source = new EventSource(url.toString(), {
                withCredentials: true,
            })
            source.onmessage = (event) => {
                if (event.data === 'END' || event.data === 'END\n') {
                    source.close()
                    setResponse(response + (event.data as string))
                } else {
                    setResponse(response + (event.data as string))
                    setLoading(false)
                }
            }
            source.onerror = (event) => {
                console.error(event)
                setLoading(false)
            }
        }
    return (
        <div>
            <h1>GuruChat</h1>
            {loading && <p>Loading...</p>}
            <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} />
            <button onClick={() => handleSubmit()}>Submit</button>
            {!loading && <p ref={textRef}></p>}
        </div>
    )
}

export default GuruChat