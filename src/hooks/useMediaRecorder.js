import { useEffect, useRef, useState } from 'react'

export function useMediaRecorder({ enabled = true } = {}) {
  const [stream, setStream] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState('')
  const [blob, setBlob] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const mediaRecorderRef = useRef(null)
  const timerRef = useRef(null)
  const chunksRef = useRef([])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [stream])

  async function requestStream() {
    if (!enabled) return null
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support media capture.')
      return null
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      setStream((prev) => {
        prev?.getTracks().forEach((track) => track.stop())
        return nextStream
      })
      setError('')
      return nextStream
    } catch (requestError) {
      setError(requestError.message || 'Unable to access camera or microphone.')
      return null
    }
  }

  async function startRecording() {
    const activeStream = stream || (await requestStream())
    if (!activeStream) return
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is not supported in this browser.')
      return
    }
    chunksRef.current = []
    setBlob(null)
    const recorder = new MediaRecorder(activeStream)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }
    recorder.onstop = () => {
      const nextBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
      setBlob(nextBlob)
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
    recorder.start()
    mediaRecorderRef.current = recorder
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000)
    setIsRecording(true)
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
  }

  function clearRecording() {
    setBlob(null)
    setElapsed(0)
  }

  return {
    stream,
    isRecording,
    error,
    blob,
    elapsed,
    requestStream,
    startRecording,
    stopRecording,
    clearRecording,
  }
}
