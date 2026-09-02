import os
from onvif import ONVIFCamera
from dotenv import load_dotenv

load_dotenv()

PTZ_IP = os.getenv("PTZ_IP")
PTZ_USER = os.getenv("PTZ_USER")
PTZ_PASSWORD = os.getenv("PTZ_PASSWORD")

# Global variables for camera state
mycam = None
ptz_service = None
media_service = None
profile_token = None

def init_ptz():
    global mycam, ptz_service, media_service, profile_token
    if not PTZ_IP or not PTZ_USER or not PTZ_PASSWORD:
        return False
        
    try:
        # Connect to camera. Port 80 is standard for ONVIF HTTP.
        # WSDL directory is usually provided by the library, or we let it download.
        mycam = ONVIFCamera(PTZ_IP, 80, PTZ_USER, PTZ_PASSWORD)
        
        # Create media service object
        media_service = mycam.create_media_service()
        
        # Get target profile
        profiles = media_service.GetProfiles()
        if not profiles:
            return False
            
        # For dual-lens cameras, the first profile might be the fixed lens without PTZ.
        # Find the first profile that has a valid PTZConfiguration.
        for profile in profiles:
            if hasattr(profile, 'PTZConfiguration') and profile.PTZConfiguration is not None:
                profile_token = profile.token
                break
                
        # If no profile with PTZ is found, default to the first one anyway
        if not profile_token:
            profile_token = profiles[0].token
        
        # Create PTZ service object
        ptz_service = mycam.create_ptz_service()
        
        return True
    except Exception as e:
        print(f"Failed to initialize ONVIF PTZ: {e}")
        return False

def ptz_move(direction: str):
    """
    Continuous move command for PTZ.
    direction can be: up, down, left, right, zoom_in, zoom_out, stop
    """
    global ptz_service, profile_token
    
    if not ptz_service:
        success = init_ptz()
        if not success:
            return False

    try:
        request = ptz_service.create_type('ContinuousMove')
        request.ProfileToken = profile_token
        
        status = ptz_service.GetStatus({'ProfileToken': profile_token})
        
        # Initialize vectors
        request.Velocity = ptz_service.GetStatus({'ProfileToken': profile_token}).Position
        request.Velocity.PanTilt.x = 0
        request.Velocity.PanTilt.y = 0
        request.Velocity.Zoom.x = 0

        # Adjust velocity based on direction (-1 to 1)
        speed = 1.0
        
        if direction == 'up':
            request.Velocity.PanTilt.y = speed
        elif direction == 'down':
            request.Velocity.PanTilt.y = -speed
        elif direction == 'left':
            request.Velocity.PanTilt.x = -speed
        elif direction == 'right':
            request.Velocity.PanTilt.x = speed
        elif direction == 'zoom_in':
            request.Velocity.Zoom.x = speed
        elif direction == 'zoom_out':
            request.Velocity.Zoom.x = -speed
        elif direction == 'stop':
            ptz_service.Stop({'ProfileToken': profile_token})
            return True
        else:
            return False

        # Send movement command
        ptz_service.ContinuousMove(request)
        return True
        
    except Exception as e:
        print(f"PTZ Move Error: {e}")
        return False
