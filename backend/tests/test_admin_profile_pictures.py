import unittest
from unittest.mock import patch, MagicMock
import os
from bson import ObjectId
from tests.test_api_flows import BaseApiFlowTestCase

class AdminProfilePictureTests(BaseApiFlowTestCase):
    def test_list_students_includes_profile_picture_field(self):
        """Verify that the student list API includes the profile_picture_file field."""
        self.login("admin@system.com", "admin123")
        
        # Add a profile picture file to the seeded student user in the fake database
        users_col = self.fake_client["biometric_auth"]["users"]
        student_user = users_col.find_one({"role": "student"})
        users_col.update_one(
            {"_id": student_user["_id"]},
            {"$set": {"profile_picture_file": "student_avatar.jpg"}}
        )

        response = self.client.get("/api/admin/students")
        self.assertEqual(response.status_code, 200)
        
        data = response.get_json()
        student_item = next((item for item in data["items"] if item["email"] == student_user["email"]), None)
        
        self.assertIsNotNone(student_item)
        self.assertEqual(student_item.get("profile_picture_file"), "student_avatar.jpg")

    def test_serve_student_profile_picture_as_admin(self):
        """Verify that admins can access student profile pictures."""
        self.login("admin@system.com", "admin123")
        
        with patch("app.routes.admin.students.send_from_directory") as mock_send, \
             patch("os.path.isfile", return_value=True), \
             patch("app.routes.auth._safe_profile_upload_folder", return_value="/fake/profile/dir"):
            
            mock_send.return_value = "fake_file_content"
            
            response = self.client.get("/api/admin/students/profile-picture/some_image.jpg")
            
            self.assertEqual(response.status_code, 200)
            mock_send.assert_called_once_with("/fake/profile/dir", "some_image.jpg")

    def test_serve_lecturer_profile_picture_as_admin(self):
        """Verify that admins can access lecturer profile pictures."""
        self.login("admin@system.com", "admin123")
        
        with patch("app.routes.admin.lecturers.send_from_directory") as mock_send, \
             patch("os.path.isfile", return_value=True), \
             patch("app.routes.auth._safe_profile_upload_folder", return_value="/fake/profile/dir"):
            
            mock_send.return_value = "fake_file_content"
            
            response = self.client.get("/api/admin/lecturers/profile-picture/lecturer_image.jpg")
            
            self.assertEqual(response.status_code, 200)
            mock_send.assert_called_once_with("/fake/profile/dir", "lecturer_image.jpg")

    def test_profile_picture_access_denied_for_students(self):
        """Verify that students cannot access the admin profile picture routes."""
        self.login("alice@student.com", "student123")
        
        # Try student route
        resp1 = self.client.get("/api/admin/students/profile-picture/some_image.jpg")
        self.assertEqual(resp1.status_code, 403) # RBAC should block this
        
        # Try lecturer route
        resp2 = self.client.get("/api/admin/lecturers/profile-picture/some_image.jpg")
        self.assertEqual(resp2.status_code, 403)

if __name__ == "__main__":
    unittest.main()
