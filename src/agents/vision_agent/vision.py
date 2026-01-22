import os
import cv2
import numpy as np
import ollama

def capture_image():
    cap = cv2.VideoCapture(0)
    ret, frame = cap.read()
    cap.release()
    return frame

def process_image(image):
    return image

def save_image(image, filename="processed_image.jpg"):
    cv2.imwrite(filename, image)

def main():
    image = capture_image()
    processed_image = process_image(image)
    save_image(processed_image, "processed_image.jpg")
    

if __name__ == "__main__":
    main()