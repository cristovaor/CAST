Feature: Clinical Assessments
  As a researcher
  I want to manage clinical assessments for a session
  So that I can evaluate participants

  Scenario: Create a clinical assessment
    Given I am an authenticated user
    And I have created a session for a participant
    When I create an assessment of type "pre_test" with score 8.5
    Then the response status code should be 200
    And the response should contain the assessment score

  Scenario: List clinical assessments for a session
    Given I am an authenticated user
    And I have created a session for a participant
    And I have created an assessment of type "post_test" with score 9.0
    When I request the assessments for the session
    Then the response status code should be 200
    And the response should contain at least 1 assessment
